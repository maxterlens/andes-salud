define(["require", "exports", "../tslib", "./element.model"], function (require, exports, tslib_1, element_model_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Segment = void 0;
    let Segment = /** @class */ (function (_super) {
        tslib_1.__extends(Segment, _super);
        function Segment(name, value) {
            if (name === void 0) {
                name = null;
            }
            if (value === void 0) {
                value = null;
            }
            let _this = _super.call(this, name, value) || this;
            _this.children = new Array();
            return _this;
        }
        return Segment;
    })(element_model_1.Element);
    exports.Segment = Segment;
});
