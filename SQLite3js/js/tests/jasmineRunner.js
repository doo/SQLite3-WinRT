(function() {
  var isPartOfSuite, jasmineEnv, testConfig = {};

  jasmineEnv = jasmine.getEnv();

  jasmineEnv.updateInterval = 1000;

  isPartOfSuite = function(suite, name) {
    if (!suite) {
      return false;
    }
    if (suite.description === name) {
      return true;
    }
    if (suite.getFullName() === name) {
      return true;
    }
    return isPartOfSuite(suite.parentSuite, name);
  }

  errorMessage = function (error) {
    var message;
    message = error.message || '';
    if (error.resultCode) {
      message += " (Code " + error.resultCode + ")";
    }
    return message;
  };

  async = function (testFunc, message, timeout) {
    var done;
    done = false;
    runs(function () {
      var testFuncPromise;
      testFuncPromise = new WinJS.Promise(function (complete) {
        return complete(testFunc());
      });
      return testFuncPromise.then(function () {
        done = true;
      }, function (error) {
        var message;
        if (error.constructor === Array) {
          message = error.filter(notNull).map(errorMessage).join(', ');
        } else {
          message = errorMessage(error);
        }
        jasmine.getEnv().currentSpec.fail(errorMessage);
        done = true;
      });
    });
    return waitsFor(function () {
      return done;
    }, message, timeout);
  };

  WinJS.Namespace.define("spec", {
    async: async
  });

  lintFileAsync = function (file) {
    var options = {
      white: true,
      nomen: true,
      bitwise: true,
      predef: [
        'WinJS', 'Windows', 'console', 'document', 'setImmediate',
        "spec",
        'jasmine', 'describe', 'xdescribe', 'it', 'xit', 'beforeEach', 'afterEach',
        'expect', 'runs', "runtime"
      ].concat(testConfig.jslintPredefines)
    };
    return Windows.Storage.FileIO.readTextAsync(file).then(function (fileContent) {
      if (!JSLINT(fileContent, options)) {
        throw new Error(JSLINT.report(true));
      }
    });
  }

  loadSpecsAsync = function () {
    return Windows.ApplicationModel.Package.current.installedLocation.getFolderAsync("spec").then(function(folder) {
      var queryOptions = new Windows.Storage.Search.QueryOptions(Windows.Storage.Search.CommonFileQuery.orderByName, [".js"]);
      var query = folder.createFileQueryWithOptions(queryOptions);
      return query.getFilesAsync().then(function (files) {
        // Return a promise so that we can chain the sync forEach
        var filesPromise = WinJS.Promise.as();
        files.forEach(function (file) {
          filesPromise = lintFileAsync(file).then(function () {
            var element = document.createElement("script");
            element.src = "/spec/" + file.name;
            document.head.appendChild(element);
          }, function error(e) {
            var element = document.createElement("div");
            element.innerHTML = "<p>File: " + file.name + "</p>" + e.message;
            document.getElementById("jslint_errors").appendChild(element);
            //console.error(file.name + "does not lint ok: " + e.message);
          });
        });
        return filesPromise;
      });
    });
  }

  Windows.Storage.StorageFile.getFileFromApplicationUriAsync('testConfig.json'.toAppPackageUri())
  .then(function (file) {
    return Windows.Storage.FileIO.readTextAsync(file);
  }).done(function(buffer) {
    var jasmineReporter, oldSpecFilter, _ref1, _ref2;
    try {
      testConfig = JSON.parse(buffer);
    } catch (e) {
      window.console.error("Could not load config.json file", e);
    }
    jasmineReporter = new jasmine.HtmlReporter;
    jasmineEnv.addReporter(jasmineReporter);
    if (testConfig.xmlOutput && jasmine.JUnitXmlReporter) {
      jasmineEnv.addReporter(new jasmine.JUnitXmlReporter("testResults"));
    }
    if ((testConfig != null ? (_ref1 = testConfig.suitesToRun) != null ? _ref1.length : void 0 : void 0) > 0) {
      if (testConfig.suitesToRun.length === 1) {
        if (testConfig.suitesToRun[0] === "") {
          delete testConfig.suitesToRun;
        }
      }
      if (((_ref2 = testConfig.suitesToRun) != null ? _ref2.length : void 0) > 0) {
        oldSpecFilter = jasmineReporter.specFilter;
        jasmineReporter.specFilter = function(spec) {
          var specSuiteFilter;
          specSuiteFilter = function(spec) {
            return testConfig.suitesToRun.some(isPartOfSuite.bind(this, spec.suite));
          };
          return oldSpecFilter.call(this, spec) && specSuiteFilter(spec);
        };
        jasmineEnv.specFilter = function(spec) {
          return jasmineReporter.specFilter(spec);
        };
      }
    }
    if (testConfig.quitAfterTests) {
      WinJS.Application.addEventListener('jasmine.junitreporter.complete', function() {
        return window.close();
      });
    }
    WinJS.Application.start();    
    return WinJS.Utilities.ready(function () {
      loadSpecsAsync().then(function () {
        return jasmineEnv.execute();
      });
    });
  });

}).call(this);
