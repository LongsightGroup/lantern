import { readArgs, syncReferencePackageSources } from './reference_sync_support.ts';

try {
  const args = readArgs(Deno.args);
  const summary = await syncReferencePackageSources(args);

  console.log(
    `${
      summary.dryRun ? 'Planned' : 'Synced'
    } ${summary.uploads.length} curated reference source file(s) to ${summary.bucket} (${summary.mode}).`,
  );
  console.log(`Packages: ${summary.appIds.join(', ')}`);

  if (summary.dryRun) {
    console.log('Uploads:');

    for (const upload of summary.uploads) {
      console.log(`- ${summary.bucket}/${upload.objectKey} <- ${upload.sourcePath}`);
    }
  } else {
    console.log('');
    console.log('Next:');
    console.log('1. Run Workers against the same PACKAGE_ARTIFACTS bucket.');
    console.log('2. Import curated apps from /admin/packages/reference.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Reference package source sync failed.');
  Deno.exit(1);
}
