import DOMPurify from "dompurify";

export const sanitizeMessage = (message: string): string => {
    return DOMPurify.sanitize(message, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: []
    });
};