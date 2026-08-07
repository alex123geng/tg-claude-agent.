import { config } from './config';
import { createServer } from './server';

const app = createServer();

app.listen(config.port, () => {
  console.log(`tg-claude-agent listening on port ${config.port}`);
});
