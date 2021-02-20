/* eslint-env mocha */
/* eslint-disable strict */

'use strict';

const isPlatformCaseInsensitive = /^[win|darwin]/.test(process.platform);

const assert = require('assert');
const fs = require('fs-extra');
const path = require('path');
const webpack = require('webpack');
const webpackPkg = require('webpack/package.json');

const CaseSensitivePathsPlugin = require('../');

function webpackCompilerAtDir(dir, otherOpts, useBeforeEmitHook) {
  const opts = Object.assign(
    {
      context: path.join(__dirname, 'fixtures', dir),
      entry: './entry',
      mode: 'development',
      output: {
        path: path.join(__dirname, 'js'),
        filename: 'result.js',
      },
      plugins: [
        new CaseSensitivePathsPlugin({
          useBeforeEmitHook: useBeforeEmitHook,
        }),
      ],
    },
    otherOpts,
  );

  if (webpackPkg.version[0] === '4') {
    opts.mode = 'development';
  }

  return webpack(opts);
}

describe('CaseSensitivePathsPlugin', () => {
  // These tests will fail on case sensitive platforms, that's the whole point of this module.
  // To ensure the rest of the library still works, disable *only these tests.*
  if (isPlatformCaseInsensitive) {
    it('should compile and warn on wrong filename case', (done) => {
      const compiler = webpackCompilerAtDir('wrong-case');

      return compiler.run((err, stats) => {
        if (err) done(err);
        assert(stats.hasErrors());
        assert.equal(stats.hasWarnings(), false);
        const jsonStats = stats.toJson();
        assert.equal(jsonStats.errors.length, 1);

        let error = jsonStats.errors[0];

        // account for webpack 5 changes
        if (error.message) error = error.message;

        // check that the plugin produces the correct output
        assert(error.indexOf('[CaseSensitivePathsPlugin]') > -1);
        assert(error.indexOf('ExistingTestFile.js') > -1); // wrong file require
        assert(error.indexOf('existingTestFile.js') > -1); // actual file name

        done();
      });
    });

    it('should compile and warn on wrong folder case', (done) => {
      const compiler = webpackCompilerAtDir('wrong-folder-case');

      return compiler.run((err, stats) => {
        if (err) done(err);
        assert(stats.hasErrors());
        assert.equal(stats.hasWarnings(), false);
        const jsonStats = stats.toJson();
        assert.equal(jsonStats.errors.length, 1);

        let error = jsonStats.errors[0];

        // account for webpack 5 changes
        if (error.message) error = error.message;

        // check that the plugin produces the correct output
        assert(error.indexOf('[CaseSensitivePathsPlugin]') > -1);
        assert(error.indexOf('Nested') > -1); // wrong file require
        assert(error.indexOf('nested') > -1); // actual file name

        done();
      });
    });

    it('should handle errors correctly in emit hook mode', (done) => {
      const compiler = webpackCompilerAtDir('wrong-case', {}, true);

      compiler.run((err, stats) => {
        if (err) done(err);
        assert(stats.hasErrors());
        assert.equal(stats.hasWarnings(), false);
        const jsonStats = stats.toJson();
        assert.equal(jsonStats.errors.length, 1);

        let error = jsonStats.errors[0];

        // account for webpack 5 changes
        if (error.message) error = error.message;
        // check that the plugin produces the correct output
        assert(error.indexOf('[CaseSensitivePathsPlugin]') > -1);
        assert(error.indexOf('ExistingTestFile.js') > -1); // wrong file require
        assert(error.indexOf('existingTestFile.js') > -1); // actual file name

        done();
      });
    });
  }

  it('should handle paths with # correctly', (done) => {
    const compiler = webpackCompilerAtDir('name-with-hash');

    return compiler.run((err, stats) => {
      if (err) done(err);
      assert.strictEqual(stats.hasErrors(), false);
      assert.strictEqual(stats.hasWarnings(), false);
      const jsonStats = stats.toJson();

      // check that the plugin produces the correct output
      assert.strictEqual(jsonStats.modules[1].name, './#/foo.js');

      done();
    });
  });

  // For future reference: This test is somewhat of a race condition, these values seem to work well.
  // If this test fails, sometimes just re-running will make it succeed.
  it('should handle the deletion of a folder', (done) => {
    const compiler = webpackCompilerAtDir('deleting-folder', {
      cache: false,
      watch: true,
    });

    // create folder and file to be deleted
    const testFolder = path.join(
      __dirname,
      'fixtures',
      'deleting-folder',
      'test-folder',
    );
    const testFile = path.join(testFolder, 'testfile.js');
    if (!fs.existsSync(testFolder)) fs.mkdirSync(testFolder);
    if (!fs.existsSync(testFile))
      fs.writeFileSync(testFile, "module.exports = '';");

    let watchCount = 0;
    let resolved = false;
    let jsonStats;
    const watcher = compiler.watch(
      { poll: 500, aggregateTimeout: 500 },
      (err, stats) => {
        // We already detected the change and marked ourselves done, don't continue.
        // Short circuits some intermittent test errors where this would be called again after
        // test completion.
        if (resolved) {
          return;
        }

        if (err) done(err);
        watchCount += 1;

        if (watchCount === 1) {
          // First run should not error.
          assert(!stats.hasErrors());
          assert(!stats.hasWarnings());

          setTimeout(() => {
            // after initial compile delete test folder
            fs.unlinkSync(testFile);
            fs.rmdirSync(testFolder);
          }, 500);
        } else if (stats.hasErrors()) {
          assert(!stats.hasWarnings());

          jsonStats = stats.toJson();
          assert.equal(jsonStats.errors.length, 1);

          resolved = true;
          watcher.close(done);
        } else {
          done(
            Error(
              'Did not detect error when folder was deleted. Try rerunning the test.',
            ),
          );
        }
      },
    );
  }).timeout(4000); // This sometimes times out.

  it('should handle the creation of a new file', (done) => {
    const compiler = webpackCompilerAtDir('file-creation');

    const testFile = path.join(
      __dirname,
      'fixtures',
      'file-creation',
      'testfile.js',
    );
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);

    let compilationCount = 0;
    const watcher = compiler.watch({}, (err, stats) => {
      if (err) done(err);

      compilationCount += 1;

      if (compilationCount === 1) {
        let error = stats.toJson().errors[0];

        // account for webpack 5 changes
        if (error.message) error = error.message;

        assert(stats.hasErrors());
        assert(
          error.indexOf('Cannot resolve') !== -1 ||
            error.indexOf("Can't resolve") !== -1,
        );
        assert(!stats.hasWarnings());

        fs.writeFileSync(testFile, 'module.exports = 0;');
      } else if (compilationCount === 2) {
        assert(fs.existsSync(testFile), 'Test file should exist');
        assert(
          !stats.hasErrors(),
          `Should have no errors, but has: \n${stats.toJson().errors}`,
        );
        assert(!stats.hasWarnings());

        fs.unlinkSync(testFile);

        watcher.close(done);
      } else {
        throw new Error('Should not reach this point!');
      }
    });
  });

  it('should work with alternate fileSystems', (done) => {
    let called = false;

    webpack(
      {
        context: path.join(__dirname, 'fixtures', 'wrong-case'),
        target: 'node',
        output: {
          path: path.join(__dirname, 'js'),
          filename: 'result.js',
        },
        entry: './entry',
        plugins: [
          new CaseSensitivePathsPlugin(),
          {
            apply(compiler) {
              let readdir;

              const onCompile = () => {
                readdir = readdir || compiler.inputFileSystem.readdir;
                // eslint-disable-next-line no-param-reassign
                compiler.inputFileSystem.readdir = function(p, cb) {
                  called = true;
                  fs.readdir(p, cb);
                };
              };

              if (compiler.hooks) {
                compiler.hooks.compile.tap('test', onCompile);
              } else {
                compiler.plugin('compile', onCompile);
              }
            },
          },
        ],
      },
      (err) => {
        if (err) done(err);
        assert(called, 'should use compiler fs');
        done();
      },
    );
  });
});
