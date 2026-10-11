// Allure 3 report settings, read by `allure generate` from the repository root: `npm run report:html`,
// `npm run tm:open` and the `allure-report` test-management adapter.
//
// A single-file report is one index.html that opens straight from disk, so a CI artifact or a file
// shared by mail needs no web server. The generator still writes summary.json and test-results.json
// next to it, which the adapter reads back.
export default {
  name: 'API QA run',
  plugins: {
    awesome: {
      options: { singleFile: true, reportLanguage: 'en' },
    },
  },
};
