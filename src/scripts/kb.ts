/**
 * Knowledge-base operations (plan T4.2, T4.3).
 *
 *   npm run kb -- import seed-pack           load core's India baseline pack
 *   npm run kb -- import iso4217
 *   npm run kb -- import csv-institutions ./data/rbi-banks.csv
 *   npm run kb -- build [COUNTRY]            build, sign and store packs (needs PACK_SIGNING_KEY)
 *   npm run kb -- coverage                   rows per country
 */
import { initModels, sequelize } from '@database/models';
import { IMPORTER_NAMES, runImport } from '@modules/knowledge-base/knowledgeBase.importers';
import { coverageByCountry } from '@modules/knowledge-base/knowledgeBase.repository';
import { buildAllPacks, buildPack } from '@modules/knowledge-base/packBuilder.service';

async function main() {
  const [command, arg, file] = process.argv.slice(2);
  initModels(sequelize);
  switch (command) {
    case 'import':
      if (!arg) throw new Error(`Usage: kb import <${IMPORTER_NAMES.join('|')}> [file]`);
      console.log(await runImport(arg, file ? { file } : {}));
      break;
    case 'build':
      console.log(arg ? await buildPack(arg.toUpperCase()) : await buildAllPacks());
      break;
    case 'coverage':
      console.table(await coverageByCountry());
      break;
    default:
      throw new Error('Usage: kb <import|build|coverage> …');
  }
}

main()
  .then(() => sequelize.close())
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
