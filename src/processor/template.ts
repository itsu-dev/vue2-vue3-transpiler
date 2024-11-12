import {SFCBlock} from "vue-sfc-parser";

export default function processTemplate(block: SFCBlock): string {
    let document = '<template';

    // Add attributes
    Object.entries(block.attrs).forEach(([key, value]) => {
        if (value === true) {
            document += ` ${key}`;
        } else {
            document += ` ${key}="${value}"`;
        }
    });

    document += '>';
    document += block.content;
    document += '</template>';

    return document;
}