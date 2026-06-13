const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const root = __dirname;
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT) || 4173;
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function createServer() {
  return http.createServer((request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    const requestedPath =
      requestUrl.pathname === "/"
        ? "/index.html"
        : requestUrl.pathname.endsWith("/")
          ? `${requestUrl.pathname}index.html`
          : requestUrl.pathname;
    const resolvedPath = path.normalize(path.join(root, decodeURIComponent(requestedPath)));

    if (!resolvedPath.startsWith(root)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    fs.readFile(resolvedPath, (error, data) => {
      if (error) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(resolvedPath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      response.end(data);
    });
  });
}

function listen(port) {
  const server = createServer();
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && !process.env.PORT) {
      listen(port + 1);
      return;
    }
    throw error;
  });
  server.listen(port, host, () => {
    const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
    console.log(`โดรนพิทักษ์น้ำท่วม running at http://${displayHost}:${port}`);
  });
}

listen(port);
