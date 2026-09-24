/**
 * Knowledge-base operations (plan T4.2, T4.3).
 *
 *   npm run kb -- import seed-pack           load core's India baseline pack
 *   npm run kb -- import iso4217
 *   npm run kb -- import csv-institutions ./data/rbi-banks.csv
 *   npm run kb -- import ifsc                download a registry (ifsc, fdic, nsi-wikidata) into review
 *   npm run kb -- import nsi-wikidata --countries=IN,US
 *   npm run kb -- build [COUNTRY]            build, sign and store packs (needs PACK_SIGNING_KEY)
 *   npm run kb -- coverage                   rows per country
 */
import { initModels, sequelize } from '@database/models';
import { IMPORTER_NAMES, runImport } from '@modules/knowledge-base/knowledgeBase.importers';
import { coverageByCountry } from '@modules/knowledge-base/knowledgeBase.repository';
import { buildAllPacks, buildPack } from '@modules/knowledge-base/packBuilder.service';

async function main() {
  const args = process.argv.slice(2);
  const flag = args.find((a) => a.startsWith('--countries='));
  const [command, arg, file] = args.filter((a) => !a.startsWith('--'));
  const countries = flag ? flag.slice('--countries='.length).split(',').map((c) => c.trim().toUpperCase()).filter(Boolean) : undefined;
  initModels(sequelize);
  switch (command) {
    case 'import':
      if (!arg) throw new Error(`Usage: kb import <${IMPORTER_NAMES.join('|')}> [file]`);
      console.log(await runImport(arg, { ...(file ? { file } : {}), ...(countries ? { countries } : {}) }));
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
