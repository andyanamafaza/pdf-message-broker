const axios = require("axios");

const testUrl = "http://localhost:3000/download";

const originalUrls = [
  "https://s29.q4cdn.com/175625835/files/doc_downloads/test.pdf",
  "https://www.sharedfilespro.com/shared-files/38/?sample.pdf",
  "https://files.testfile.org/PDF/10MB-TESTFILE.ORG.pdf",
  // "https://files.testfile.org/PDF/100MB-TESTFILE.ORG.pdf",  
];

const urls = Array.from({ length: 2 }).flatMap(() => originalUrls);

const requestData = { urls };

axios
  .post(testUrl, requestData)
  .then((response) => {
    console.log("Response status:", response.status);
    console.log("Response data:", response.data);
  })
  .catch((error) => {
    console.error("Error:", error.message);
    if (error.response) {
      console.error("Response data:", error.response.data);
    }
  });
