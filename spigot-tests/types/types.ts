export interface IUser {
  acdAutoAnswer: boolean;
  addresses: string[];
  chat: {
    jabberId: string;
  };
  department: string;
  division: {
    id: string;
    name: string;
    selfUri: string;
  };
  email: string;
  id: string;
  images: Array<{ resolution: string; imageUri: string; }>;
  name: string;
  primaryContactInfo: Array<{ address: string; mediaType: string; type: string }>;
  selfUri: string;
  state: string;
  title: string;
  username: string;
  version: number;
}

export interface IOrg {
  defaultCountryCode: string;
  defaultLanguage: string;
  defaultSiteId: string;
  deletable: boolean;
  domain: string;
  features: {[name: string]: boolean};
  id: string;
  name: string;
  selfUri: string;
  state: string;
  thirdPartyOrgId: string;
  thridPartOrgName: String;
  version: number;
  voicemailEnabled: string;
}

export interface IUserQueue {
  id: string;
  joined: boolean;
  name: string;
  selfUri: string;
}

export interface IContext {
  user: IUser;
  org: IOrg;
  userQueues: IUserQueue[];
  jid: string;
  authToken: string;
  wrapupCodes: any[];
}
