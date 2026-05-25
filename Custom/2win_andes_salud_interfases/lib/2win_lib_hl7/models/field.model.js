define(["require", "exports", "../tslib", "./element.model"], function (require, exports, tslib_1, element_model_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Field = void 0;
    let Field = /** @class */ (function (_super) {
        tslib_1.__extends(Field, _super);
        function Field(name, value) {
            if (name === void 0) {
                name = null;
            }
            if (value === void 0) {
                value = null;
            }
            return _super.call(this, name, value) || this;
        }
        return Field;
    })(element_model_1.Element);
    exports.Field = Field;
});
