define(["require", "exports", "../tslib", "./segment.model"], function (require, exports, tslib_1, segment_model_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.RepeatingField = void 0;
    let RepeatingField = /** @class */ (function (_super) {
        tslib_1.__extends(RepeatingField, _super);
        function RepeatingField(name, value) {
            if (name === void 0) {
                name = null;
            }
            if (value === void 0) {
                value = null;
            }
            return _super.call(this, name, value) || this;
        }
        return RepeatingField;
    })(segment_model_1.Segment);
    exports.RepeatingField = RepeatingField;
});
