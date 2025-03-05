const fs = require('fs');
const https = require('https');
const next = require('next');

const app = next({ dev: true });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  https
    .createServer(
      {
        key: fs.readFileSync('./localhost-key.pem'),
        cert: fs.readFileSync('./localhost.pem'),
      },
      (req, res) => handle(req, res)
    )
    .listen(3000, () => {
      console.log('> Ready on https://localhost:3000');
    });
});
