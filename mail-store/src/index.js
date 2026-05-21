import 'dotenv/config';
import express from 'express';
import { initSchema } from './db.js';
import ingestRouter from './routes/ingest.js';
import messagesRouter from './routes/messages.js';
import stateRouter from './routes/state.js';

const app = express();
app.use(express.json({ limit: '20mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/', ingestRouter);
// State route must come before messages route — /messages/state would otherwise
// be captured as /messages/:id with id='state'
app.use('/', stateRouter);
app.use('/', messagesRouter);

const PORT = process.env.PORT || 3025;

initSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`mail-store listening on :${PORT}`));
  })
  .catch(err => {
    console.error('Failed to init schema:', err);
    process.exit(1);
  });
