(function() {
  var isPartOfSuite, jasmineEnv;

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

  String.prototype.toUri = function () {
    return new Windows.Foundation.Uri(this);
  }

  String.prototype.toAppPackageUri = function () {
    return ("ms-appx:///" + this).toUri();
  }

  Windows.Storage.StorageFile.getFileFromApplicationUriAsync('spec/testConfig.json'.toAppPackageUri())
  .then(function (file) {
    return Windows.Storage.FileIO.readTextAsync(file);
  }).done(function(buffer) {
    var jasmineReporter, oldSpecFilter, testConfig, _ref, _ref1, _ref2;
    testConfig = {};
    try {
      testConfig = JSON.parse(buffer);
    } catch (e) {
      if ((_ref = window.console) != null) {
        if (typeof _ref.error === "function") {
          _ref.error("Could not load config.json file", e);
        }
      }
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
    return WinJS.Utilities.ready(function() {
      return jasmineEnv.execute();
    });
  });

}).call(this);
