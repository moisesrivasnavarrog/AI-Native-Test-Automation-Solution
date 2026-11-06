export interface UserCredentials {
  username: string;
  password: string;
}

export const standardUser: UserCredentials = {
  username: 'standard_user',
  password: 'secret_sauce',
};
