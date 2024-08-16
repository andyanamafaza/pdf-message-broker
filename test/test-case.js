const axios = require("axios");

const testUrl = "http://localhost:3000/download";

const originalUrls = ["https://files.testfile.org/PDF/10MB-TESTFILE.ORG.pdf"];

const urls = originalUrls.flatMap((url) => Array(10).fill(url));

const requestData = { urls };

axios
  .post(testUrl, requestData)
  .then((response) => {
    console.log("Response status:", response.status);
    console.log("Response data:", response.data);
  })
  .catch((error) => {
    console.error("Error:", error.message);
    console.error("Response data:", error.response.data);
  });
