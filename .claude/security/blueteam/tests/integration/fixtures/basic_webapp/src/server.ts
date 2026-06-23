import fs from 'fs';
import path from 'path';
import { app } from './app';
import { PORT } from './config';

// Ensure the data directory exists before the database is opened
const dataDir = path.resolve('./data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure the exports directory exists for the export route
const exportsDir = path.resolve('./exports');
if (!fs.existsSync(exportsDir)) {
  fs.mkdirSync(exportsDir, { recursive: true });
}

app.listen(PORT, () => {
  console.log(`Employee Directory listening on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
