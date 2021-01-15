module.exports = {
  entryPoints: [
    'src/index.ts',
  ],
  // stripInternal: true,
  readme: 'none',
  out: 'docs',
  excludePrivate: true,
  includeVersion: true
}

// "inputFiles": ["./src/"],	  "entryPoints": ["src/index.ts", "src/defaults.ts", "src/lib/validation.ts"],
// "entryPoint": "declarationStrictValuePlugin",	
// "mode": "modules",	
// "readme": "none",	  "readme": "none",
// "out": "docs"	  "out": "docs",
// "includeVersion": true