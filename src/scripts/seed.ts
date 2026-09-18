import { runSeed } from '../../database/seeders';

runSeed()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  });
