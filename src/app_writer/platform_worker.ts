import { createAppWriterPlatformServicesHandler } from './platform_services.ts';
import { createTypeScriptAppPackageSourceCompiler } from './typescript_source_compiler.ts';
import { validateGeneratedAppPackage } from './validation.ts';

export default createAppWriterPlatformServicesHandler({
  sourceCompiler: createTypeScriptAppPackageSourceCompiler(),
  previewer: {
    preview(input) {
      return validateGeneratedAppPackage({
        selectedStarterId: input.selectedStarterId,
        files: input.files,
      });
    },
  },
});
