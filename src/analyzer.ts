import { Analysis, ExtraCommandLineOptions, File, Imports, LocationInFile } from './types';
export { Analysis } from './types'

interface FileExport {
  usageCount: number;
  location: LocationInFile
}

interface FileExports {
  [index: string]: FileExport,
}

interface ExportItem {
  exports: FileExports,
  path: string;
}

interface ExportMap {
  [index: string]: ExportItem;
}

const getFileExports = (file: File): ExportItem => {
  const exports: FileExports = {};
  file.exports.forEach((e, index) => {
    exports[e] = {
      usageCount: 0,
      location: file.exportLocations[index]
    };
  });

  return { exports, path: file.fullPath };
};

const getExportMap = (files: File[]): ExportMap => {
  const map: ExportMap = {};
  files.forEach(file => {
    map[file.path] = getFileExports(file);
  });
  return map;
};

const processImports = (imports: Imports, exportMap: ExportMap) => {
  Object.keys(imports).forEach(key => {
    const ex = exportMap[key] && exportMap[key].exports;
    if (!ex) return;
    imports[key].forEach(imp =>
      imp == '*'
        ? Object.keys(ex).filter(e => e != 'default').forEach(e => ex[e].usageCount++)
        : ex[imp].usageCount++);
  });
};

const expandExportFromStar = (files: File[], exportMap: ExportMap) => {
  files.forEach(file => {
    const fileExports = exportMap[file.path];
    file
      .exports
      .filter(ex => ex.indexOf('*:') === 0)
      .forEach(ex => {
        delete fileExports.exports[ex];

        Object.keys(exportMap[ex.slice(2)].exports)
          .filter(e => e != 'default')
          .forEach(key => {
            if (!fileExports.exports[key]) {
              const export1 = exportMap[ex.slice(2)].exports[key];
              fileExports.exports[key] = {
                usageCount: 0,
                location: export1.location
              };
            }
            fileExports.exports[key].usageCount = 0;
          });
      });
  });
};

// Allow disabling of results, by path from command line (useful for large projects)
const shouldPathBeIgnored = (path: string, extraOptions?: ExtraCommandLineOptions) => {
  if (!extraOptions || !extraOptions.pathsToIgnore) {
    return false;
  }

  return extraOptions.pathsToIgnore.some(ignore => path.indexOf(ignore) >= 0);
}

export default (files: File[], extraOptions?: ExtraCommandLineOptions): Analysis => {
  const exportMap = getExportMap(files);
  expandExportFromStar(files, exportMap);
  files.forEach(file => processImports(file.imports, exportMap));

  const analysis: Analysis = {};

  Object.keys(exportMap).forEach(file => {
    const expItem = exportMap[file];
    const { exports, path } = expItem;

    if (shouldPathBeIgnored(path, extraOptions))
      return;

    const unusedExports = Object.keys(exports).filter(k => exports[k].usageCount === 0);

    if (unusedExports.length === 0) {
      return;
    }

    analysis[path] = [];
    unusedExports.forEach(e => {
      analysis[path].push({
        exportName: e,
        location: exports[e].location
      });
    });
  });

  return analysis;
};
