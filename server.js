const jsonServer = require("json-server");
const fs = require("fs");
const path = require("path");
const express = require("express");
const { v4: uuidv4 } = require("uuid"); // Import UUID

const server = jsonServer.create();
const dbPath = path.join(__dirname, "db.json");
let router;

function loadDatabase() {
  try {
    const rawData = fs.readFileSync(dbPath, "utf8");
    JSON.parse(rawData);

    router = jsonServer.router(dbPath);
    console.log("Database loaded successfully");
    return true;
  } catch (error) {
    console.error("Error loading database:", error.message);
    return false;
  }
}

loadDatabase();

const middlewares = jsonServer.defaults();

fs.watch(dbPath, (eventType) => {
  if (eventType === "change") {
    try {
      loadDatabase();
    } catch (error) {
      console.error("Error reloading database:", error.message);
    }
  }
});

server.use(middlewares);

server.use(express.json());

server.use((req, res, next) => {
  if (!router) {
    return res.status(500).json({
      code: 500,
      message: "Database is not currently available",
      data: null,
    });
  }

  if (req.method === "POST" || req.method === "PUT") {
    if (!req.body) {
      return res.status(400).json({
        code: 400,
        message: "Request body is required",
        data: null,
      });
    }

    if (req.method === "POST") {
      req.body.id = uuidv4(); // Generate unique ID
      req.body.created_at = new Date().toISOString(); // Set current timestamp
    } 
    else if (req.method === "PUT") {
      const existingItem = router.db.get("shift_daily").find({ id: req.body.id }).value();
      if (existingItem && existingItem.created_at) {
        req.body.created_at = existingItem.created_at;
      }
    }
  }

  next();
});

server.get("/shift_daily/:id", (req, res) => {
  try {
    const { id } = req.params;
    const item = router.db.get("shift_daily").find({ id }).value();

    if (!item) {
      return res.status(404).json({
        code: 404,
        message: "Resource not found",
        data: null
      });
    }

    res.json({
      code: 200,
      message: "success",
      data: item
    });
  } catch (error) {
    console.error("Error retrieving shift daily detail:", error);
    res.status(500).json({
      code: 500,
      message: "Error retrieving resource",
      data: null
    });
  }
});

server.use((req, res, next) => {
  if (req.method === "GET" && req.path === "/shift_daily") {
    const page = parseInt(req.query._page || 1, 10);
    const limit = parseInt(req.query._limit || 10, 10);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    try {
      let data = router.db.get("shift_daily").value();

      // Apply filters dynamically
      Object.keys(req.query).forEach((key) => {
        if (key.startsWith("filter_")) {
          const filterField = key.replace("filter_", "");
          const filterValue = req.query[key];

          // Special handling for day_type filter
          if (filterField === "day_type") {
            data = data.filter(
              (item) =>
                (filterValue === "true" && item.day_type === "Working Day") ||
                (filterValue === "false" && item.day_type === "OFF")
            );
          } else if (filterField === "flexible_shift") {
            data = data.filter(
              (item) =>
                (filterValue === "true" && item.flexible_shift === "Yes") ||
                (filterValue === "false" && item.flexible_shift === "No")
            );
          } else if (filterField === "status") {
            data = data.filter(
              (item) =>
                (filterValue === "true" && item.status === "Active") ||
                (filterValue === "false" && item.status === "Inactive")
            );
          } else {
            const parsedFilterValue =
              filterValue === "true"
                ? true
                : filterValue === "false"
                ? false
                : filterValue;

            data = data.filter((item) => item[filterField] === parsedFilterValue);
          }
        }
      });

      // Add search functionality for shift_code
      if (req.query.search) {
        const searchTerm = req.query.search.toLowerCase();
        data = data.filter((item) =>
          item.shift_code.toLowerCase().includes(searchTerm)
        );
      }

      // Add ordering functionality with validation
      const orderColumn = req.query.order_column;
      const orderValue = req.query.order;

      if (orderColumn && orderValue !== "") {
        const orderDirection = orderValue === "desc" ? -1 : 1;

        data.sort((a, b) => {
          if (a[orderColumn] < b[orderColumn]) return -1 * orderDirection;
          if (a[orderColumn] > b[orderColumn]) return 1 * orderDirection;
          return 0;
        });
      } else {
        // Default sort by created_at in descending order (newest first)
        data.sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
      }

      const paginatedData = data.slice(startIndex, endIndex);

      res.json({
        code: 200,
        message: "success",
        data: {
          results: paginatedData,
          meta: {
            current_page: page,
            per_page: limit,
            total_page: Math.ceil(data.length / limit),
            total_data: data.length,
          },
        },
      });
    } catch (error) {
      console.error("Error processing shift_daily:", error);
      res.status(500).json({
        code: 500,
        message: "Error processing shift data",
        data: null,
      });
    }
  } else if (req.method === "GET" && req.path === "/find_all_menu") {
    try {
      const menuData = router.db.get("find_all_menu").value();

      res.json({
        code: 200,
        message: "success",
        data: menuData,
      });
    } catch (error) {
      console.error("Error processing find_all_menu:", error);
      res.status(500).json({
        code: 500,
        message: "Error retrieving menu data",
        data: null,
      });
    }
  } else {
    next();
  }
});

server.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    code: 500,
    message: "An unexpected error occurred",
    data: null,
  });
});

server.use(router || jsonServer.router({}));

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`JSON Server is running on port ${PORT}`);
});
