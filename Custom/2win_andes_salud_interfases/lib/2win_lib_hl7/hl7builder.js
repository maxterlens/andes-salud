define(["require", "exports"], function (require, exports) {
    class Field {
        constructor(length) {
            this.repeatIndex = 0;
            this.repeats = [new Array(length || 0)];
        }
        set = function (location, data) {
            if (location > this.repeats[this.repeatIndex].length) {
                for (let i = this.repeats[this.repeatIndex].length; i < location; i++) {
                    this.repeats[this.repeatIndex].push("");
                }
            }

            this.repeats[this.repeatIndex][location] = data || "";
        };

        get(index, repeat) {
            if (repeat && (repeat > this.repeatIndex || repeat < 0)) {
                return null;
            }
            if (typeof repeat === "undefined") {
                repeat = this.repeatIndex;
            }
            const repeatGroup = this.repeats[repeat];

            return index && index > -1 && index < repeatGroup.length ? repeatGroup[index] : null;
        }

        repeat() {
            const arrayLength = this.repeats[this.repeatIndex].length;
            const newArray = new Array(arrayLength).join(".").split(".");
            this.repeats.push(newArray);
            this.repeatIndex++;
        }

        toString(repeatDelimiter, componentDelimiter) {
            // TODO: Add subcomponents
            const fieldStrings = [];
            for (let repeat in this.repeats) {
                fieldStrings.push(this.repeats[repeat].join(componentDelimiter || "^"));
            }
            return fieldStrings.join(repeatDelimiter || "~");
        }
    }

    class Segment {
        constructor(segmentName) {
            this.fields = [];

            if (!segmentName || segmentName.length !== 3) {
                throw new Error("Segment header must be set.");
            }

            this.fields.push(createFieldFromString(segmentName.toUpperCase()));
        }

        set(location, field) {
            if (location === 0) {
                throw new Error("Cannot set segment name through set.");
            }

            if (location > this.fields.length) {
                for (let i = this.fields.length; i < location; i++) {
                    this.fields.push(new Field(0));
                }
            }

            if (field) {
                if (typeof field !== "object" || typeof field.repeat === "undefined") {
                    field = createFieldFromString(field);
                }
            } else {
                field = new Field();
            }

            this.fields[location] = field;

            if (location === 0) {
                this.fields[location].repeats[0][0] = this.fields[location].repeats[0][0].toUpperCase();
            }
        }

        get(index, repeatDelimiter, componentDelimiter, subComponentDelimiter) {
            if (isNaN(index) === false && index < this.fields.length) {
                const field = this.fields[index];
                return field.toString(repeatDelimiter, componentDelimiter, subComponentDelimiter);
            }
            return null;
        }

        getName() {
            return this.get(0);
        }

        toString(delimiters) {
            delimiters = delimiters || {};

            const fields = [];
            this.fields.forEach(function (field) {
                const fieldString = field.toString(delimiters.repeat, delimiters.component, delimiters.subComponent);

                fields.push(fieldString);
            });

            return fields.join(delimiters.field || "|");
        }
    }
    function createFieldFromString(fieldValue) {
        let field = new Field();
        field.set(0, fieldValue);
        return field;
    }
    class Message {
        constructor(options) {
            if (!options || typeof options !== "object") {
                throw new Error("No se definieron las opciones del mensaje");
            }
            if (!options.messageType || !options.messageEvent) {
                throw new Error("No se definio el tipo de mensaje y evento");
            }

            options.delimiters = options.delimiters || {};

            this.segments = [];
            this.delimiters = {
                segment: options.delimiters.segment || "\n",//se modifico por n para que lo soporte la libreria de parseo
                field: options.delimiters.field || "|",
                component: options.delimiters.component || "^",
                repeat: options.delimiters.repeat || "~",
                escape: options.delimiters.escape || "\\",
                subComponent: options.delimiters.subComponent || "&"
            };

            addMessageHeader.bind(this)(options);
        }
        add(segment) {
            if (segment.getName() === "MSH") {
                throw new Error("Cannot add another message header. One is automatically added.");
            }

            this.segments.push(segment);
        }

        toString = function () {
            let segmentStrings = [];
            for (let i in this.segments) {
                segmentStrings.push(this.segments[i].toString(this.delimiters));
                // console.log(this.segments[i].toString(this.delimiters));
            }

            return segmentStrings.join(this.delimiters.segment);
        };
    }

    function addMessageHeader(headerOptions) {
        let segment = new Segment("MSH");
        segment.set(1, this.delimiters.component + this.delimiters.repeat + this.delimiters.escape + this.delimiters.subComponent);
        segment.set(2, headerOptions.sendingApplication || "");
        segment.set(3, headerOptions.sendingFacility || "");
        segment.set(4, headerOptions.receivingApplication || "");
        segment.set(5, headerOptions.receivingFacility || "");

        let timestamp = getTimestamp();
        segment.set(6, timestamp);

        let messageTypeField = new Field();
        messageTypeField.set(0, headerOptions.messageType);
        messageTypeField.set(1, headerOptions.messageEvent);

        segment.set(8, messageTypeField);
        segment.set(9, headerOptions.messageId || "");
        segment.set(10, "D"); // D=Desarrollo, P=Producción
        segment.set(11, headerOptions.version || "2.5");
        this.segments.push(segment);

        if (headerOptions.eventSegment === true) {
            addEventSegment.bind(this)(headerOptions.messageEvent, timestamp);
        }
    }

    function addEventSegment(event, timestamp) {
        let segment = new Segment("EVN");
        segment.set(1, event);
        segment.set(2, timestamp);
        this.segments.push(segment);
    }

    function getTimestamp() {
        const date = new Date();
        date.setMinutes(date.getMinutes() + 2);

        return date.getFullYear() + `0${date.getMonth() + 1}`.slice(-2) + `0${date.getDate()}`.slice(-2) + `0${date.getHours()}`.slice(-2) + `0${date.getMinutes()}`.slice(-2);
    }
    return { Message, Segment, Field };
});
