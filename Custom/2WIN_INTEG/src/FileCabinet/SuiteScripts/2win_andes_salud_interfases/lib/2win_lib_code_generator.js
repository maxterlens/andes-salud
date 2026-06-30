define([], function () {
    function generateRandomString(nrocharacters = 3) {
        const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let result = "";
        for (let i = 0; i < nrocharacters; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    }

    return { generateRandomString: generateRandomString };
});
