#!/usr/bin/env python3

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os
import socket
import webbrowser
import threading
import subprocess
import atexit

DIRECTORY_TO_SERVE = os.getcwd()
STARTING_PORT = 3333


class DevHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY_TO_SERVE, **kwargs)

    def log_message(self, format, *args):
        pass  # Override to suppress logging

    def translate_path(self, path):
        path = path.split("?", 1)[0]
        path = path.split("#", 1)[0]
        path = os.path.join(self.directory, *path.split("/"))
        return path

    def end_headers(self):
        self.send_header(
            "Cache-Control", "no-store, no-cache, must-revalidate, max-age=0"
        )
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def find_next_free_port(start_port):
    port = start_port
    while port < 65536:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("", port))
                return port
        except OSError:
            port += 1


if __name__ == "__main__":
    port = find_next_free_port(STARTING_PORT)
    address = "127.0.0.1"
    url = f"""http://{address}:{port}"""

    esbuild_command = [
        "esbuild",
        "static/js/game.js",
        "--watch",
        "--minify",
        "--outfile=static/js/game.min.js"
    ]
    esbuild_process = subprocess.Popen(esbuild_command)

    tsc_command = [
        "tsc",
        "-p",
        "ts/tsconfig.json",
        "--watch"
    ]
    tsc_process = subprocess.Popen(tsc_command)

    def kill_processes():
        print("Terminating esbuild process ...")
        esbuild_process.kill()
        print("Terminating tsc process ...")
        tsc_process.kill()

    atexit.register(kill_processes)

    with ThreadingHTTPServer((address, port), DevHandler) as httpd:
        print(f"Serving {DIRECTORY_TO_SERVE} ...")
        print("Logging disabled. To re-enable comment out `DevHandler.log_message()`")
        server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        server_thread.start()
        print(f"Opening {url} in default browser ...")
        webbrowser.open(url, new=2, autoraise=True)
        try:
            server_thread.join()
        except KeyboardInterrupt:
            httpd.shutdown()
