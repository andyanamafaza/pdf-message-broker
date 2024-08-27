const mongoose = require("mongoose");

const logEntrySchema = new mongoose.Schema({
  url: String,
  filename: String,
  destination: String,
  downloadStartTime: Date,
  downloadEndTime: Date,
  saveStartTime: Date,
  saveEndTime: Date,
  downloadDuration: Number, // in milliseconds
  saveDuration: Number, // in milliseconds
  status: String,
  fileSize: Number, // in bytes
}, { timestamps: true });

const LogEntry = mongoose.model("LogEntry", logEntrySchema);

module.exports = LogEntry;
