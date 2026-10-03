"""Serve ThinkTank locally without build tools or third-party packages.

Run: py serve.py [--port 8080]
The larger connection backlog accommodates the aquarium's many parallel assets
and classic scripts on older Python/Windows installations.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class LocalServer(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8080)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    with LocalServer(('127.0.0.1', args.port), handler) as server:
        print('ThinkTank: http://localhost:{}/'.format(args.port), flush=True)
        print('Serving {}. Press Ctrl+C to stop.'.format(root), flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
