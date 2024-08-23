const mongoose = require("mongoose");

const logEntrySchema = new mongoose.Schema({
  url: String,
  filename: String,
  destination: String,
  startTime: Date,
  endTime: Date,
  duration: Number, // in milliseconds
  status: String,
  fileSize: Number, // in bytes
}, { timestamps: true });

const LogEntry = mongoose.model("LogEntry", logEntrySchema);

module.exports = LogEntry;
