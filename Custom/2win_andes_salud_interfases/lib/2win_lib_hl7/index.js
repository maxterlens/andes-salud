define([
    "require",
    "exports",
    "./hl7parser",
    "./models/element.model",
    "./models/field.model",
    "./models/hl7message.model",
    "./models/repeating-field.model",
    "./models/segment.model",
    "./models/sub-field.model",
    "./definitionBuilder",
    "./hl7parser",
    "./hl7builder"
], function (
    require,
    exports,
    hl7parser_1,
    element_model_1,
    field_model_1,
    hl7message_model_1,
    repeating_field_model_1,
    segment_model_1,
    sub_field_model_1,
    definitionBuilder_1,
    hl7parser_2,
    hl7builder_2
) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = exports.Hl7Parser = exports.DefinitionBuilder = exports.SubField = exports.Segment = exports.RepeatingField = exports.Hl7Message = exports.Field = exports.Element = void 0;
    let module = {
        Hl7Parser: hl7parser_1.Hl7Parser
    };
    exports.default = module;
    Object.defineProperty(exports, "Element", {
        enumerable: true,
        get: function () {
            return element_model_1.Element;
        }
    });
    Object.defineProperty(exports, "Field", {
        enumerable: true,
        get: function () {
            return field_model_1.Field;
        }
    });
    Object.defineProperty(exports, "Hl7Message", {
        enumerable: true,
        get: function () {
            return hl7message_model_1.Hl7Message;
        }
    });
    Object.defineProperty(exports, "RepeatingField", {
        enumerable: true,
        get: function () {
            return repeating_field_model_1.RepeatingField;
        }
    });
    Object.defineProperty(exports, "Segment", {
        enumerable: true,
        get: function () {
            return segment_model_1.Segment;
        }
    });
    Object.defineProperty(exports, "SubField", {
        enumerable: true,
        get: function () {
            return sub_field_model_1.SubField;
        }
    });
    Object.defineProperty(exports, "DefinitionBuilder", {
        enumerable: true,
        get: function () {
            return definitionBuilder_1.DefinitionBuilder;
        }
    });
    Object.defineProperty(exports, "Hl7Parser", {
        enumerable: true,
        get: function () {
            return hl7parser_2.Hl7Parser;
        }
    });
    Object.defineProperty(exports, "Hl7Builder", {
        enumerable: true,
        get: function () {
            return hl7builder_2;
        }
    });
});
