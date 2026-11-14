const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

process.chdir(__dirname);

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = process.env.PORT || '3000';
const numericPort = /^\d+$/.test(String(port)) ? Number(port) : port;

const app = next({ dev, dir: __dirname, hostname, port: numericPort });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      await handle(req, res, parse(req.url, true));
    } catch (error) {
      console.error('BMU server request error:', error);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  const ready = () => console.log(`BMU Registry running on ${typeof numericPort === 'number' ? `http://${hostname}:${numericPort}` : numericPort}`);

  if (typeof numericPort === 'number') {
    server.listen(numericPort, hostname, ready);
  } else {
    server.listen(numericPort, ready);
  }
}).catch((error) => {
  console.error('BMU server failed to start:', error);
  process.exit(1);
});
