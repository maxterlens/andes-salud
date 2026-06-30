define([
    "require",
    "exports",
    "./models/field.model",
    "./models/hl7message.model",
    "./models/repeating-field.model",
    "./models/segment.model",
    "./models/sub-field.model",
    "./definitionBuilder"
], function (require, exports, field_model_1, hl7message_model_1, repeating_field_model_1, segment_model_1, sub_field_model_1, definitionBuilder_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Hl7Parser = void 0;
    let Hl7Parser = /** @class */ (function () {
        function Hl7Parser() {}
        /** Builds an Hl7Message model from Raw hl7 string.
         *
        "withDefinitions" flag indicates whether to build pure model or with definitions on every hl7 field
        */
        Hl7Parser.prototype.getHl7Model = function (rawHl7Message, withDefinitions) {
            if (withDefinitions === void 0) {
                withDefinitions = false;
            }
            if (!rawHl7Message) throw new Error("Hl7 message was not provided");
            let definitionbuilder = new definitionBuilder_1.DefinitionBuilder();
            if (withDefinitions) {
                let hl7Message = this.buildHl7Message(rawHl7Message);
                definitionbuilder.addDefinitionToHl7Message(hl7Message);
                return hl7Message;
            }
            return this.buildHl7Message(rawHl7Message);
        };
        Hl7Parser.prototype.getRawHl7Message = function (hl7Message) {
            //TODO
        };
        Hl7Parser.prototype.buildHl7Message = function (rawHl7Message) {
            let _this = this;
            let hl7Message = new hl7message_model_1.Hl7Message();
            hl7Message.children = rawHl7Message.split("\r").map(function (rawSegment) { // \n 
                if (rawSegment.length > 3 && rawSegment.indexOf("|") > 2) {
                    return _this.buildSegment(rawSegment);
                }
            });
            return hl7Message;
        };
        Hl7Parser.prototype.buildSegment = function (rawSegment) {
            let _this = this;
            let rawSegmentArr = rawSegment.split("|");
            let segment = new segment_model_1.Segment(rawSegmentArr[0], rawSegment);
            let i = 0;
            segment.children = rawSegmentArr.map(function (rawElement) {
                //If element is special then skip one number
                if (rawElement == "^~\\&" || rawElement == "^~&" || rawElement == "^~\\@" || rawElement == "^~@") {
                    i++;
                }
                return _this.buildElement(rawElement, `${segment.name}-${i++}`);
            });
            return segment;
        };
        Hl7Parser.prototype.buildElement = function (rawElement, elementName) {
            let _this = this;
            if (rawElement == "^~\\&" || rawElement == "^~&" || rawElement == "^~\\@" || rawElement == "^~@") {
                return new field_model_1.Field(elementName, rawElement);
            } else if (rawElement.indexOf("~") !== -1 && rawElement != "^~\\&" && rawElement != "^~\\" && rawElement != "\r" && rawElement != "\n") {
                let repeatingField = new repeating_field_model_1.RepeatingField(elementName, rawElement);
                let i_1 = 1;
                repeatingField.children = rawElement.split("~").map(function (rawRepeatingFieldElement) {
                    return _this.buildElement(rawRepeatingFieldElement, `${elementName}/${i_1++}`);
                });
                return repeatingField;
            } else if (rawElement.indexOf("^") !== -1) {
                let subField = new sub_field_model_1.SubField(elementName, rawElement);
                let i_2 = 0;
                if (elementName.indexOf("/") !== -1) {
                    elementName = elementName.slice(0, elementName.indexOf("/"));
                }
                subField.children = rawElement.split("^").map(function (rawSubField) {
                    return _this.buildElement(rawSubField, `${elementName}.${i_2++}`);
                });
                return subField;
            }
            return new field_model_1.Field(elementName, rawElement);
        };
        return Hl7Parser;
    })();
    exports.Hl7Parser = Hl7Parser;
});
