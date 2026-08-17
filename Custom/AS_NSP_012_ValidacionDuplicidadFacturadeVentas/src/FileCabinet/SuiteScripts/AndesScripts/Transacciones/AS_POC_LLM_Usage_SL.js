/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/llm', 'N/log'], (llm, log) => {

    const onRequest = (context) => {
        try {

            const generateRemaining = llm.getRemainingFreeUsage();
            const embedRemaining = llm.getRemainingFreeEmbedUsage();

            log.audit({
                title: 'N/llm - Free Usage',
                details: {
                    generateRemaining,
                    embedRemaining
                }
            });

            context.response.write({
                output: `
                    <h2>NetSuite AI - N/llm</h2>
                    <hr>
                    <p><b>Generate disponibles:</b> ${generateRemaining}</p>
                    <p><b>Embed disponibles:</b> ${embedRemaining}</p>
                `
            });

        } catch (e) {

            log.error({
                title: 'Error N/llm',
                details: e
            });

            context.response.write({
                output: `
                    <h2>Error consultando N/llm</h2>
                    <p><b>${e.name}</b></p>
                    <pre>${e.message}</pre>
                `
            });
        }
    };

    return {
        onRequest
    };
});