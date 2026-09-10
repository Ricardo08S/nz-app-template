import "./env.ts";
import { logError } from "./log.js";

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  logError("Unhandled Rejection", reason);
  // Don't exit the process, just log the error
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  logError("Uncaught Exception", error);
  // Don't exit the process, just log the error
});
