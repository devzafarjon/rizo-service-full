import { runDatabaseBackup } from "../src/lib/backup.js";

runDatabaseBackup()
  .then((file) => {
    console.log(`Backup written to ${file}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
