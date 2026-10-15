/**
* Power Pages Server Logic
*
* Quick References:
* - Server.Logger → diagnostics logging
*   Example: Server.Logger.Log("message")
*   Example: Server.Logger.Error("error message")
*
* - Server.Context → query params, headers, body
*   Example: Server.Context.QueryParameters["id"], Server.Context.Headers["Authorization"], Server.Context.Body
*
* - Server.Connector.HttpClient → external API calls
*   Example: await Server.Connector.HttpClient.GetAsync("<URL>/1", {"Content-Type":"application/json"});
*   Example: await Server.Connector.HttpClient.PostAsync("<URL>", "{"name":"New Object"}", {"Authorization": "Bearer "},"application/json");
*   Example: await Server.Connector.HttpClient.PatchAsync("<URL>/1", "{"capacity":"1 TB"}", {"Authorization": "Bearer "},"application/json");
*   Example: await Server.Connector.HttpClient.DeleteAsync("<URL>/1", {"Authorization": "Bearer "},"application/json");
*
* - Server.Connector.Dataverse → CRUD in Dataverse & CustomApi
*   Example: Server.Connector.Dataverse.CreateRecord("accounts", "{"name":"Contoso Ltd."}");
*   Example: Server.Connector.Dataverse.RetrieveRecord("accounts", "accountid-guid", "$select=name,telephone1");
*   Example: Server.Connector.Dataverse.UpdateRecord("accounts", "accountid-guid", "{"telephone1":"123-456-7890"}");
*   Example: Server.Connector.Dataverse.DeleteRecord("accounts", "accountid-guid");
*   Example: Server.Connector.Dataverse.InvokeCustomApi("new_CustomApiName", "{"ParameterName":"value"}");
*
* - Server.User → signed-in user info
*   Example: Server.User.fullname, Server.User.Roles
*
* Full details: see https://go.microsoft.com/fwlink/?linkid=2334908
*/
 
function get() {
    try {
 
        if (!Server.Context.QueryParameters["id"]) {
            const errorMsg = "Missing required query parameter: id";
            Server.Logger.Error(errorMsg);
            return JSON.stringify({ status: "error", method: "GET", message: errorMsg });
        }
 
        Server.Logger.Log("GET called"); // Logger reference
        const id = Server.Context.QueryParameters["id"]; // Context reference
 
        // 🔹 Quick HttpClient GET example
        // const response = await Server.Connector.HttpClient.GetAsync("https://api.nuget.org/v3/index.json", {"Content-Type":"application/json"});
        // return JSON.parse(response.Body);
 
 
        return JSON.stringify({ status: "success", method: "GET", id: id });
    } catch (err) {
        Server.Logger.Error("GET failed: " + err.message);
        return JSON.stringify({ status: "error", method: "GET", message: err.message });
    }
}
 
async function post() {
    try {
        const tenantId = "189fd6af-5f23-41d9-8763-cde57608f4e8";
        const clientId = "233e78e7-47a4-4d58-8c3e-8b47b4441e0a";
        const clientSecret = "d7t8Q~UKrSEhLZLmmEAnFMY81nF5k9IM0R_Kraww";
 
        const d365Url = "https://insureai.api.crm6.dynamics.com";
 
        // Step 1: Fetch OAuth access token
        const tokenUrl =
            `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
 
        const tokenBody = JSON.stringify({
            grant_type: "client_credentials",
            client_id: clientId,
            client_secret: clientSecret,
            scope: `${d365Url}/.default`
        });
 
        const tokenResult = await Server.Connector.HttpClient.PostAsync(
            tokenUrl,
            tokenBody,
            { Accept: "application/json" },
            "application/x-www-form-urlencoded"
        );
 
        const tokenResponse = typeof tokenResult === "string"
            ? JSON.parse(tokenResult)
            : tokenResult;
 
        if (!tokenResponse.IsSuccessStatusCode) {
            throw new Error(
                tokenResponse.ServerErrorMessage ||
                `Token request failed: ${tokenResponse.StatusCode}`
            );
        }
 
        const tokenData = typeof tokenResponse.Body === "string"
            ? JSON.parse(tokenResponse.Body)
            : tokenResponse.Body;
 
        const token = tokenData?.access_token;
 
        if (!token) {
            throw new Error("Access token not found");
        }
 
        // Step 2: Call lead_webapi with the access token
        const apiUrl =
            "";
 
        const fetchXml = `
            <fetch>
                <entity name="aur_quotes">
                    <attribute name="aur_quotesid" />
                    <attribute name="aur_vehicle_value" />
                </entity>
            </fetch>
            `;
        const apiBody = JSON.stringify({
                actionName: "retrievemultiple",
                isAdmin: true,
                userId: "",
                fetchXml,
        })
 
        const apiResult = await Server.Connector.HttpClient.PostAsync(
            apiUrl,
            apiBody,
            {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
                "OData-Version": "4.0",
                "OData-MaxVersion": "4.0"
            },
            
            "application/json"
        );
 
        const apiResponse = typeof apiResult === "string"
            ? JSON.parse(apiResult)
            : apiResult;
 
        // Step 3: Parse API response
        let data = null;
 
        if (apiResponse.Body) {
            try {
                data = typeof apiResponse.Body === "string"
                    ? JSON.parse(apiResponse.Body)
                    : apiResponse.Body;
            } catch {
                data = apiResponse.Body;
            }
        }
 
        return JSON.stringify({
            success: apiResponse.IsSuccessStatusCode,
            statusCode: apiResponse.StatusCode,
            reasonPhrase: apiResponse.ReasonPhrase,
            serverError: apiResponse.ServerError,
            serverErrorMessage: apiResponse.ServerErrorMessage,
            data
        });
 
    } catch (error) {
        Server.Logger.Error(
            "Server Logic failed: " + error.message
        );
 
        return JSON.stringify({
            success: false,
            error: error.message
        });
    }
}
 
 
function put() {
    try {
        Server.Logger.Log("PUT called");
        const id = Server.Context.QueryParameters["id"];
        const data = Server.Context.Body;
 
        // 🔹 Quick Dataverse Update example
        // var response = Server.Connector.Dataverse.UpdateRecord("accounts", id, data);
 
        return JSON.stringify({ status: "success", method: "PUT", id: id, data: data });
    } catch (err) {
        Server.Logger.Error("PUT failed: " + err.message);
        return JSON.stringify({ status: "error", method: "PUT", message: err.message });
    }
}
 
 
async function patch() {
    try {
        Server.Logger.Log("PATCH called");
        const id = Server.Context.QueryParameters["id"];
        const data = Server.Context.Body;
 
        // 🔹 Quick HttpClient PATCH example
        // await Server.Connector.HttpClient.PatchAsync("<URL>" + id, JSON.stringify({ capacity: "1 TB" }), {"Authorization": "Bearer "},"application/json");
 
        return JSON.stringify({ status: "success", method: "PATCH", id: id, data: data });
    } catch (err) {
        Server.Logger.Error("PATCH failed: " + err.message);
        return JSON.stringify({ status: "error", method: "PATCH", message: err.message });
    }
}
 
 
function del() {
    try {
        // "delete" keyword should not be used in script file.
        Server.Logger.Log("DEL called");
        const id = Server.Context.QueryParameters["id"];
 
        // 🔹 Quick Dataverse Del example
        // var response = Server.Connector.Dataverse.DeleteRecord("accounts", id);
 
        return JSON.stringify({ status: "success", method: "DEL", id: id });
    } catch (err) {
        Server.Logger.Error("Deletion failed: " + err.message);
        return JSON.stringify({ status: "error", method: "DEL", message: err.message });
    }
}
 