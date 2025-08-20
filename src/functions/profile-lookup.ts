// Imports global types and axios
import '@twilio-labs/serverless-runtime-types';
import axios, { AxiosBasicCredentials } from 'axios';

// Fetches specific types
import {
    Context,
    ServerlessCallback,
    ServerlessFunctionSignature,
    ServerlessEventObject,
} from '@twilio-labs/serverless-runtime-types/types';

//email or phone most be there or we will error out, if both are present phone is used
type ProfileLookupEvent = {
    taskSid?: string;//the sid for the task we want to associate the context to if saveToContext is false you don't need this
    phone?: string; // The phone number to look up
    email?: string; // The email address to look up
    saveToContext?: boolean; // this is defaulted to true turn this off if you don't want to save to context
    doPostToAISummary?: boolean; // use this if they have AI summarization enabled
};

type ProfileLookupContext = {
    phone_key?: string;
    email_key?: string;
    ACCOUNT_SID?: string;
    AUTH_TOKEN?: string;
}

// URLS we will need in the axios requests
const profileConnectorURL = "https://preview.twilio.com/ProfileConnector";
const contextUrl = "https://context.twilio.com/v1/Contexts";

// Headers we will need for different types of requests
const headersJSON = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
};
const headersFormUrlEncoded = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/x-www-form-urlencoded',
}


export const handler: ServerlessFunctionSignature = async function (
    context: Context<ProfileLookupContext>,
    event: ServerlessEventObject<ProfileLookupEvent>,
    callback: ServerlessCallback
) {
    // TODO would love to use client for these calls instead of axios
    // const client = context.getTwilioClient();
    const { ACCOUNT_SID, AUTH_TOKEN, phone_key = "phone", email_key = "email" } = context;

    const auth: AxiosBasicCredentials = {
        username: ACCOUNT_SID as string,
        password: AUTH_TOKEN as string
    };

    // Create a axios config for JSON  content-type
    const axiosJSONConfig = {
        headersJSON,
        auth
    };

    // Create a axios config for FormUrlEncoded content-type
    const axiosFormUrlEncodedConfig = {
        headersFormUrlEncoded,
        auth
    };

    // saveToContext only defaults to true if not provided, if false is provided it should be that.
    const { phone, email, taskSid, saveToContext = true, doPostToAISummary = false } = event;

    // if we don't have a phone or email we can't look up a profile
    if (!phone && !email) {
        callback(new Error("Either phone or email must be provided."));
        return;
    }

    // get the active profile connector instance sid becasue we will need it for later calls to the profile API.
    async function getProfileConnectorInstanceSid() {
        const { data: connectorInstanceData } = await axios.get(`${profileConnectorURL}/Instances/${ACCOUNT_SID}`, axiosJSONConfig);
        return connectorInstanceData.configuration_id;
    }

    // use the key and value to find the profile by phone or email
    async function findProfile() {
        const profileFindData = new URLSearchParams();
        profileFindData.append("UniqueName", profileConnectorInstanceSid);
        profileFindData.append("Attributes", JSON.stringify({ key: phone ? phone_key : email_key, value: phone ? phone : email }));
        profileFindData.append("WriteIfNotFound", "true");
        // use the phone or email we recieved to do a lookup
        const { data: profileData } = await axios.post(`${profileConnectorURL}/Profiles/Find`, profileFindData, axiosFormUrlEncodedConfig);
        //find the first identified profile
        const identifiedProfile = profileData?.profiles?.find((profile: any) => {
            return profile.profile.status === "identified"
        });

        if (identifiedProfile) {
            return identifiedProfile;
        }
        //find the first unknown profile
        const unindentifiedProfile = profileData?.profiles?.find((profile: any) => (
            profile.profile.status === "unknown"
        ));

        // set profile first to identified and fallback to unknown if not there.
        return unindentifiedProfile;
    }

    // this will create a new context and add the profileConnectSid and connectorName to it, 
    // once the context is made it will use the taskSid to make it a lookupId for this task.
    async function postToContextAndAttachLookupId(profileConnectSid: string) {
        const contextBody = {
            namespace: "Twilio",
            attribute_group: "ProfileData",
            attributes: {
                profileConnectSid: profileConnectSid,
                // due to scoping profileConnectorInstanceSid should be available here, even though it is defined below this function
                connectorName: profileConnectorInstanceSid,
            }
        };
        //create a context with the profile sid that we found
        const { data: contextData } = await axios.post(contextUrl, contextBody, axiosJSONConfig);
        const { sid: contextSid } = contextData;
        // add the task sid that we were sent to the lookup of the new context we created
        await axios.post(`${contextUrl}/${contextSid}/LookupIds`, { id: taskSid }, axiosJSONConfig);
    }
    // Note: ATM hitting this route from a function is impossible leaving the stub so if it is ever opened to the public we can hit it.
    async function postToAISummary(profileConnectSid: string) {
        
        // await axios.post(`${profileConnectorURL}/Profiles/${profileConnectSid}/Summary`, {sid: profileConnectSid}, axiosJSONConfig);
        return;
    }

    const profileConnectorInstanceSid = await getProfileConnectorInstanceSid();
    const profile = await findProfile();

    if (profile) {
        const { sid: profileConnectSid } = profile.profile;
        // if we have a taskSid and saveToContext is not set to false
        taskSid && saveToContext && postToContextAndAttachLookupId(profileConnectSid);
        doPostToAISummary && await postToAISummary(profileConnectSid);
        callback(null, profile.profile)
    } else {
        callback(null, undefined);
    }

};