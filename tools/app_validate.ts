import { validateLocalAppPackage } from '../src/authoring/local_app.ts';

try {
  const packageRoot = Deno.args[0];

  if (!packageRoot) {
    throw new Error('Usage: deno task app:validate <package-root>');
  }

  const result = await validateLocalAppPackage(packageRoot);

  if (!result.ok || !result.appPackage) {
    console.error('Lantern app validation failed.');

    for (const issue of result.issues) {
      console.error(`- ${issue}`);
    }

    Deno.exit(1);
  }

  console.log('Lantern app validation passed.');
  console.log(`- App ID: ${result.appPackage.reviewData.appId}`);
  console.log(`- Version: ${result.appPackage.reviewData.version}`);
  console.log(`- Entrypoint: ${result.appPackage.manifest.entrypoint}`);
  console.log(`- Capabilities: ${result.appPackage.reviewData.capabilities.join(', ')}`);
  console.log(`- Preview tests: ${String(result.appPackage.previewTests.length)}`);

  for (const warning of result.warnings) {
    console.log(`- Warning: ${warning}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Lantern app validation failed.');
  Deno.exit(1);
}
