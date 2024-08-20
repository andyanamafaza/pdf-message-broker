const axios = require("axios");

const testUrl = "http://localhost:3000/download";

const originalUrls = ["https://s29.q4cdn.com/175625835/files/doc_downloads/test.pdf",
                      "https://www.sharedfilespro.com/shared-files/38/?sample.pdf",
                      "https://spks.or.id/file/publikasi/Test.pdf"
];

const urls = originalUrls.flatMap((url) => Array(5).fill(url));

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
