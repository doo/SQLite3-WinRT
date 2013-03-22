(function () {
  "use strict";

  String.prototype.toUri = function () {
    return new Windows.Foundation.Uri(this);
  };

  String.prototype.toAppPackageUri = function () {
    return this.toAppPackage().toUri();
  };

  String.prototype.toAppPackage = function () {
    return "ms-appx:///" + this;
  };

}());