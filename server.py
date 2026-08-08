#!/usr/bin/env python3
"""Serves the demo on http://localhost:8000 . Run: python3 server.py"""
import http.server
import socketserver

PORT = 8000

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving at http://localhost:{PORT}  (open index.html in Chrome)")
        httpd.serve_forever()
