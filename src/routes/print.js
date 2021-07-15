var express = require("express");
const { buildPDFWithCallback } = require("../service/print/pdf");
const { buildCSVWithCallback } = require("../service/print/csv");
const requestMiddleware = require("../middlewares/request.middleware");
// const base64 = require('base64topdf');
​
​
const BASE_URL = "/program/v1";
​
// Refactor this to move to service
async function printPDF(req, res) {
  const id = req.query.id;
  const format = req.query.format;
​
  buildPDFWithCallback(id, function (binary, error, errorMsg) {
    var date = new Date();
    if (!error) {
      if (format === "json") {
        const resJSON = {
          id: "api.collection.print",
          ver: "1.0",
          ts: date.toISOString(),
          params: {
            id,
            format,
            status: "successful",
            err: null,
            errmsg: null,
          },
          responseCode: "OK",
          result: {
            content_id: id,
            base64string: binary,
          },
        };
        res.send(resJSON);
      } else {
        res.setHeader('Content-disposition', `attachment; filename=${id}.pdf`);
        res.setHeader('Content-type', 'application/pdf');
        res.send(`data:application/pdf;base64, ${binary}`);
      }
    } else {
      res.status(404).send({
        error: errorMsg,
      });
    }
  });
}
​
async function printCSV(req, res) {
  const id = req.query.id;
  const format = req.query.format;
​
  buildCSVWithCallback(id, function (binary, error, errorMsg) {
    var date = new Date();
    if (!error) {
      if (format === "json") {
        const resJSON = {
          id: "api.collection.print",
          ver: "1.0",
          ts: date.toISOString(),
          params: {
            id,
            format,
            status: "successful",
            err: null,
            errmsg: null,
          },
          responseCode: "OK",
          result: {
            content_id: id,
            base64string: binary,
          },
        };
        res.send(resJSON);
        // let decodedBase64 = binary.base64Decode('base64Str', 'response.pdf');
​
      } else {
    
        res.setHeader('Content-disposition', `attachment; filename=${id}.csv`);
        res.setHeader('Content-type', 'text/csv');
        res.send(binary);
      }
    } else {
      res.status(404).send({
        error: errorMsg,
      });
    }
  });
}
​
module.exports = function (app) {
  app
    .route(BASE_URL + "/print/pdf")
    .get(
      requestMiddleware.gzipCompression(),
      requestMiddleware.createAndValidateRequestBody,
      printPDF
    );
  app
    .route(BASE_URL + "/print/csv")
    .get(
      requestMiddleware.gzipCompression(),
      requestMiddleware.createAndValidateRequestBody,
      printCSV
    );
};