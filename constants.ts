
import { InterfaceAbi } from "ethers";

// Default PulseChain RPC
// Using alternative reliable RPC provided by user to avoid rate limits/overloads
export const DEFAULT_RPC_URL = "https://rpc.pulsechainstats.com";

export const GEMINI_MODELS = [
    'gemini-2.5-flash-preview-09-2025',
    'gemini-flash-latest',
    'gemini-3-pro-preview',
    'gemini-flash-lite-latest',
    'gemma-3-4b-it'
];

export const DYSNOMIA_ERRORS = [
    "error DysnomiaInsufficientBalance(address origin, address sender, address from, address to, address what, uint256 balance, uint256 needed)",
    "error DysnomiaInsufficientAllowance(address origin, address sender, address owner, address spender, address what, uint256 allowance, uint256 needed)",
    "error MarketRateNotFound(address asset)",
    "error ExchangeRateNotFound(address SpendAsset, address ReceiveAsset)",
    "error OwnableInvalidOwner(address origin, address owner, address what)",
    "error OwnableUnauthorizedAccount(address origin, address account, address what)",
    "error InvalidUserToken(address Asset)",
    "error InvalidOwnership(address UserToken, address User)",
    "error NoUserEntry(address User)",
    "error NoUserName(address User)",
    "error UserAlreadyCreated(address User)",
    "error NotShioOwner(address Shio, address Requestor)",
    "error InvalidLogXi(string Xi)",
    "error ReactionZeroError(uint64 Eta, uint64 Kappa)",
    "error ReactionInequalityError(uint64 Eta, uint64 Kappa)",
    "error SigmaAlreadyInstalled(address Phi)",
    "error MarketRateCanOnlyBeIncreased(address Contract, uint256 CurrentRate)",
    "error TokenMaximumRate(address Contract, uint256 MaximumRate)",
    "error BouncerUnauthorized(address origin, address account, address what)",
    "error AlreadyJoined(address UserToken)",
    "error CoverChargeUnauthorized(address AssetAddress, uint256 Amount)",
    "error PayCover(address Asset, uint256 CoverCharge)",
    "error Forbidden(address Asset)",
    "error NotAdmitted(uint64 Soul)",
    "error AlreadyAdded(address Origin, address Yue, address New)",
    "error NotOrigin(address YueOrigin, address Requestor)",
    "error PlayerMustOptIn(address Player, address Yue, address Contract)",
    "error NotStarted(address)"
];

// ---------------------------------------------------------------------------
// ADDRESS REGISTRY
// ---------------------------------------------------------------------------

export const ADDRESSES: Record<string, string> = {
  // CORE INFRASTRUCTURE
  VOID: "0x965b0d74591bf30327075a247c47dbf487dcff08", 
  SIU: "0x43136735603d4060f226c279613a4dd97146937c",
  YANG: "0xb702b3ec6d9de1011be963efe30a28b6ddfbe011",
  YAU: "0x7e91d862a346659daeed93726e733c8c1347a225",
  ZHOU: "0x5cc318d0c01fed5942b5ed2f53db07727d36e261",
  ZHENG: "0x24e62c39e34d7fe2b7df1162e1344eb6eb3b3e15",
  YI: "0x4757438723055f14a1af5c9651c2e37730f41a9e",
  
  // FACTORIES
  LAU_FACTORY: "0xbA6CcD38992839aEE20D5bF9125b1d94190b091C",
  SHA_FACTORY: "0x4208333D65A90577E3da39B84D6A95eb9db717D2",
  SHIO_FACTORY: "0x5063D2A97960DDE8dc5E3e5A69aAa379C6301F1C",

  // DOMAIN: DAN (Governance & Map)
  CHO: "0xB6be11F0A788014C1F68C92F8D6CcC1AbF78F2aB",
  MAP: "0xD3a7A95012Edd46Ea115c693B74c5e524b3DdA75",
  WAR: "0x965b0d74591bf30327075a247c47dbf487dcff08", 

  // DOMAIN: SKY (Network & Time)
  CHAN: "0xe250bf9729076B14A8399794B61C72d0F4AeFcd8",
  CHOA: "0x0f5a352fd4cA4850c2099C15B3600ff085B66197",
  RING: "0x1574c84Ec7fA78fC6C749e1d242dbde163675e72",

  // DOMAIN: TANG (Player Management)
  SEI: "0x3dC54d46e030C42979f33C9992348a990acb6067",
  CHEON: "0x3d23084cA3F40465553797b5138CFC456E61FB5D",
  META: "0xE77Bdae31b2219e032178d88504Cc0170a5b9B97",
  
  // DOMAIN: SOENG CHAIN (Sound/Power)
  QI: "0x4d9Ce396BE95dbc5F71808c38107eB7422FD9a03",
  MAI: "0xc48B0a4E79eF302c8Eb5be71F562d08fB8E6A3d8",
  XIA: "0x7f4a4DD4a6f233d2D82BE38b2F9fc0Fef46f25FA",
  XIE: "0x4Df51741F2926525A21bF63E4769bA70633D2792",
  ZI: "0xCbAdd3C3957Bd9D6C036863CB053FEccf3D53338",
  PANG: "0xEe25Ccd41671F3B67d660cf6532085586aec8457",

  // LIBRARIES & UTILS
  HECKE: "0x29A924D9B0233026B9844f2aFeB202F1791D7593",
  LIB_ATTRIBUTE: "0x529e3e15da19c7c828f9cce13c53f7031a30ec7c",
  LIB_STRINGS: "0x4ab87f1DBDF6f741ED8BF481C7346103a86f1068",
  LIB_REACTIONS: "0x8704d7740735F6DEA0103366fE297Ba3F9fCaCc4",

  // ASSETS (PulseChain)
  WPLS: "0xA1077a294dDE1B09bB078844df40758a5D0f9a27",
  ATROPA: "0x7a20189B297343CF26d8548764b04891f37F3414", 
  AFFECTION: "0x24F0154C1dCe548AdF15da2098Fdd8B8A3B8151D",
  //CHATLOG_SHIO: "0x27242c1605e557224259b977755b46b29f032213" // Fomalhaute/ZHOU SHIO // This address seems to be wrong - keep it out for now
};

// ---------------------------------------------------------------------------
// FULL ABI REGISTRY (Consolidated)
// ---------------------------------------------------------------------------

// Using the full JSON ABIs provided in the context
export const DYSNOMIA_ABIS: Record<string, any[]> = {
  VOID: [
    "function AddLibrary(string name, address _a)",
    "function Alias(address name, string value)",
    "function Alias(tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega) Theta) view returns (string)",
    "function Alias(tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega) Theta, string value)",
    "function Alias(address name) view returns (string)",
    "function Chat(string chatline)",
    "function Clear(uint64 Iota) returns (uint64)",
    "function Enter() returns (uint64[3] Saat, tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega) On)",
    "function Enter(string name, string symbol) returns (uint64[3] Saat, tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega) On)",
    "function GetAttribute(string name) view returns (string)",
    "function GetLibraryAddress(string name) view returns (address)",
    "function GetMarketRate(address _a) view returns (uint256)",
    "function Log(address Sigma, string LogLine)",
    "function Log(string LogLine)",
    "function Log(uint64 Sigma, string LogLine)",
    "function Nu() returns (address)",
    "function Purchase(address _t, uint256 _a)",
    "function Redeem(address _t, uint256 _a)",
    "function Rename(string newName, string newSymbol)",
    "function SetAttribute(string name, string value)",
    "function Sign(uint64 DIRAC1) returns (tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega))",
    "function Type() view returns (string)",
    "function addOwner(address newOwner)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function maxSupply() view returns (uint256)",
    "function mintToCap()",
    "function name() view returns (string)",
    "function owner() view returns (address)",
    "function renounceOwnership(address toRemove)",
    "function symbol() view returns (string)",
    "function totalSupply() view returns (uint256)",
    "function transfer(address to, uint256 value) returns (bool)",
    "function transferFrom(address from, address to, uint256 value) returns (bool)"
  ],
  LAU: [
    "function Alias(address name, string value)",
    "function Alias(tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega) Theta) view returns (string)",
    "function Alias(tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega) Theta, string value)",
    "function Alias(address name) view returns (string)",
    "function Chat(string chatline)",
    "function CurrentArea() view returns (address)",
    "function Eta() view returns (address)",
    "function GetMarketRate(address _a) view returns (uint256)",
    "function Leave()",
    "function MotzkinPrime() view returns (uint64)",
    "function On() view returns (address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega)",
    "function Purchase(address _t, uint256 _a)",
    "function Redeem(address _t, uint256 _a)",
    "function Rename(string newName, string newSymbol)",
    "function Saat(uint256) view returns (uint64)",
    "function Type() view returns (string)",
    "function Username() view returns (string)",
    "function Username(string newUsername)",
    "function Void(bool really1, bool really2)",
    "function Withdraw(address what, uint256 amount)",
    "function Xiao() view returns (address)",
    "function addOwner(address newOwner)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function maxSupply() view returns (uint256)",
    "function mintToCap()",
    "function name() view returns (string)",
    "function owner() view returns (address)",
    "function renounceOwnership(address toRemove)",
    "function symbol() view returns (string)",
    "function totalSupply() view returns (uint256)",
    "function transfer(address to, uint256 value) returns (bool)",
    "function transferFrom(address from, address to, uint256 value) returns (bool)"
  ],
  CHO: [
    "function AddContractOwner(address Contract, address Owner)",
    "function AddLibraryOwner(string what)",
    "function AddSystemAddress(string Alias, address Address)",
    "function Addresses(string) view returns (address)",
    "function Aliases(uint256) view returns (string)",
    "function Enter(address UserToken) returns (tuple(uint64 Soul, tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega) On, string Username, uint64 Entropy) User)",
    "function Entropy() view returns (uint64)",
    "function GetAddressBySoul(uint64 soul) view returns (address UserAddress)",
    "function GetMarketRate(address _a) view returns (uint256)",
    "function GetUser() returns (tuple(uint64 Soul, tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega) On, string Username, uint64 Entropy) Alpha)",
    "function GetUserBySoul(uint64 Soul) returns (tuple(uint64 Soul, tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega) On, string Username, uint64 Entropy) Alpha)",
    "function GetUserSoul() view returns (uint64)",
    "function GetUserTokenAddress(address wallet) view returns (address UserToken)",
    "function Gua() view returns (uint256)",
    "function Luo() returns (uint256 De)",
    "function MotzkinPrime() view returns (uint64)",
    "function On() view returns (address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega)",
    "function Purchase(address _t, uint256 _a)",
    "function Qu(uint256) view returns (address)",
    "function React(uint64 Eta) returns (uint64, uint64)",
    "function ReactUser(uint64 Soul, uint64 Epsilon) returns (uint64 Omicron)",
    "function Reactor() view returns (address)",
    "function Recall(tuple(uint64 Soul, tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega) On, string Username, uint64 Entropy) Alpha) returns (uint64 UserEntropy)",
    "function Redeem(address _t, uint256 _a)",
    "function Rename(string newName, string newSymbol)",
    "function Saat(uint256) view returns (uint64)",
    "function Type() view returns (string)",
    "function VerifyUserTokenPermissions(address UserToken)",
    "function Void() view returns (address)",
    "function Xiao() view returns (address)",
    "function addOwner(address newOwner)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function has(address _contract, string what) view returns (bool does)",
    "function maxSupply() view returns (uint256)",
    "function mintToCap()",
    "function name() view returns (string)",
    "function owner() view returns (address)",
    "function renounceOwnership(address toRemove)",
    "function symbol() view returns (string)",
    "function totalSupply() view returns (uint256)",
    "function transfer(address to, uint256 value) returns (bool)",
    "function transferFrom(address from, address to, uint256 value) returns (bool)"
  ],
  ENCRYPT: [
    "function Encapsulate(tuple(uint64 Soul, tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega) On, string Username, uint64 Entropy) From, uint64 Gamma, uint64 Rho, uint64 Upsilon, uint64 Ohm) returns (uint64 Entropy, bytes Geng)",
    "function Encrypt(uint64 From, uint64 to, string Key, string Data) returns (uint64 index)",
    "function Encrypt(uint64 From, uint64 to, bytes Key, bytes Data) returns (uint64 index)",
    "function Decrypt(uint64 From, uint64 to, uint64 Index, string Key) returns (bytes)",
    "function Decrypt(uint64 From, uint64 to, uint64 Index, bytes Key) returns (bytes result)",
    "function Prune()",
    "function Saat(bytes Geng) pure returns (uint64[3])",
    "function Type() view returns (string)",
    "function hashKey(bytes Key) returns (uint64 result)"
  ],
  QING: [
    "function AddMarketRate(address Contract, uint256 Rate)",
    "function Admitted(address UserToken) view returns (bool)",
    "function AllowCROWS(bool _b)",
    "function Asset() view returns (address)",
    "function BouncerDivisor() view returns (uint16)",
    "function Chat(address UserToken, string MSG)",
    "function Cho() view returns (address)",
    "function CoverCharge() view returns (uint256)",
    "function Entropy() view returns (uint64)",
    "function GWAT() view returns (bool)",
    "function GetMarketRate(address _a) view returns (uint256)",
    "function GetQing(uint256 QingWaat) view returns (address)",
    "function Join(address UserToken)",
    "function Map() view returns (address)",
    "function MotzkinPrime() view returns (uint64)",
    "function NoCROWS() view returns (bool)",
    "function Purchase(address _t, uint256 _a)",
    "function Redeem(address _t, uint256 _a)",
    "function Rename(string newName, string newSymbol)",
    "function Type() view returns (string)",
    "function Waat() view returns (uint256)",
    "function Withdraw(address what, uint256 amount)",
    "function Xiao() view returns (address)",
    "function addOwner(address newOwner)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function bouncer(address cBouncer) view returns (bool)",
    "function decimals() view returns (uint8)",
    "function maxSupply() view returns (uint256)",
    "function mintToCap()",
    "function name() view returns (string)",
    "function owner() view returns (address)",
    "function removeGuest(address _a)",
    "function renounceOwnership(address toRemove)",
    "function setBouncerDivisor(uint16 _d)",
    "function setCoverCharge(uint256 _c)",
    "function setGuestlist(address _a)",
    "function setStaff(address _a, bool active)",
    "function symbol() view returns (string)",
    "function totalSupply() view returns (uint256)",
    "function transfer(address to, uint256 value) returns (bool)",
    "function transferFrom(address from, address to, uint256 value) returns (bool)"
  ],
  YUE: [
    "function Bar(address Qing) view returns (uint256 Hypogram, uint256 Epigram)",
    "function Chan() view returns (address)",
    "function ChangeOrigin(address NewOrigin)",
    "function GetAssetRate(address GwatAsset, address Integrative) view returns (uint256 Rate)",
    "function GetMarketRate(address _a) view returns (uint256)",
    "function Hong(address SpendAsset, address QingAsset, uint256 PurchaseAmount)",
    "function Hung(address QingAsset, address ReceiveAsset, uint256 RedeemAmount)",
    "function IsValidAsset(address GwatAsset, address Integrative) view returns (bool)",
    "function MintToOrigin()",
    "function MotzkinPrime() view returns (uint64)",
    "function Origin() view returns (address)",
    "function Purchase(address _t, uint256 _a)",
    "function React(address Qing) returns (uint256 Charge)",
    "function Redeem(address _t, uint256 _a)",
    "function Rename(string newName, string newSymbol)",
    "function Type() view returns (string)",
    "function Withdraw(address what, address To, uint256 amount)",
    "function Xiao() view returns (address)",
    "function addOwner(address newOwner)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function hasMint(address _contract) view returns (bool does)",
    "function maxSupply() view returns (uint256)",
    "function mintToCap()",
    "function name() view returns (string)",
    "function owner() view returns (address)",
    "function renounceOwnership(address toRemove)",
    "function symbol() view returns (string)",
    "function totalSupply() view returns (uint256)",
    "function transfer(address to, uint256 value) returns (bool)",
    "function transferFrom(address from, address to, uint256 value) returns (bool)"
  ],
  SHA: [
    "function Adduct(uint64 _Phi) returns (uint64)",
    "function Avail(uint64 Xi)",
    "function Bond()",
    "function Conify(uint64 _Beta)",
    "function Conjugate(uint64 Chi)",
    "function Dynamo() returns (uint64)",
    "function Form(uint64 Chi)",
    "function Fuse(uint64 _rho, uint64 Upsilon, uint64 Ohm)",
    "function GetMarketRate(address _a) view returns (uint256)",
    "function Polarize()",
    "function Purchase(address _t, uint256 _a)",
    "function React(uint64 Pi, uint64 Theta) returns (uint64, uint64)",
    "function Redeem(address _t, uint256 _a)",
    "function Rename(string newName, string newSymbol)",
    "function Saturate(uint64 _Beta, uint64 Epsilon, uint64 Theta)",
    "function Type() view returns (string)",
    "function View() returns (tuple(uint64 Base, uint64 Secret, uint64 Signal, uint64 Channel, uint64 Contour, uint64 Pole, uint64 Identity, uint64 Foundation, uint64 Element, uint64 Coordinate, uint64 Charge, uint64 Chin, uint64 Monopole))",
    "function addOwner(address newOwner)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function maxSupply() view returns (uint256)",
    "function mintToCap()",
    "function name() view returns (string)",
    "function owner() view returns (address)",
    "function renounceOwnership(address toRemove)",
    "function symbol() view returns (string)",
    "function totalSupply() view returns (uint256)",
    "function transfer(address to, uint256 value) returns (bool)",
    "function transferFrom(address from, address to, uint256 value) returns (bool)"
  ],
  SHIO: [
    "function Cone() view returns (address)",
    "function Generate(uint64 Xi, uint64 Alpha, uint64 Beta)",
    "function GetMarketRate(address _a) view returns (uint256)",
    "function Isolate()",
    "function Isomerize()",
    "function Log(uint64 Soul, uint64 Aura, string LogLine)",
    "function Magnetize() returns (uint64)",
    "function Manifold() returns (uint64)",
    "function Monopole() returns (uint64)",
    "function Purchase(address _t, uint256 _a)",
    "function React(uint64 Pi) returns (uint64, uint64)",
    "function Redeem(address _t, uint256 _a)",
    "function Rename(string newName, string newSymbol)",
    "function Rho() view returns (tuple(address Rod, address Cone, uint64 Barn))",
    "function Rod() view returns (address)",
    "function Type() view returns (string)",
    "function addOwner(address newOwner)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function maxSupply() view returns (uint256)",
    "function mintToCap()",
    "function name() view returns (string)",
    "function owner() view returns (address)",
    "function renounceOwnership(address toRemove)",
    "function symbol() view returns (string)",
    "function totalSupply() view returns (uint256)",
    "function transfer(address to, uint256 value) returns (bool)",
    "function transferFrom(address from, address to, uint256 value) returns (bool)"
  ],
  SIU: [
    "function Aura() view returns (uint64)",
    "function GetMarketRate(address _a) view returns (uint256)",
    "function Miu(string name, string symbol) returns (uint64[3] Saat, tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega) On)",
    "function Psi() returns (address)",
    "function Purchase(address _t, uint256 _a)",
    "function Redeem(address _t, uint256 _a)",
    "function Rename(string newName, string newSymbol)",
    "function Type() view returns (string)",
    "function addOwner(address newOwner)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function maxSupply() view returns (uint256)",
    "function mintToCap()",
    "function name() view returns (string)",
    "function owner() view returns (address)",
    "function renounceOwnership(address toRemove)",
    "function symbol() view returns (string)",
    "function totalSupply() view returns (uint256)",
    "function transfer(address to, uint256 value) returns (bool)",
    "function transferFrom(address from, address to, uint256 value) returns (bool)"
  ],
  LAUFactory: [
     "function New(string name, string symbol) returns (address Mu)",
     "function Void() view returns (address)"
  ],
  SHAFactory: [
     "function New(string name, string symbol, address MathLib) returns (address)"
  ],
  SHIOFactory: [
     "function New(address Rod, address Cone, address MathLib) returns (address)"
  ],
  MAP: [
     "event NewQing(address Qing, address Integrative, uint256 Waat)",
     "function Cho() view returns (address)",
     "function Forbid(address Token, bool Disallow)",
     "function Forbidden(address Asset) view returns (bool)",
     "function GetMapQing(int256 Latitude, int256 Longitude) view returns (address)",
     "function GetMarketRate(address _a) view returns (uint256)",
     "function GetQing(uint256 Waat) view returns (address)",
     "function Map() view returns (address)",
     "function MotzkinPrime() view returns (uint64)",
     "function New(address Integrative) returns (address Mu)",
     "function Offset() view returns (uint256)",
     "function Purchase(address _t, uint256 _a)",
     "function Redeem(address _t, uint256 _a)",
     "function Rename(string newName, string newSymbol)",
     "function Type() view returns (string)",
     "function Xiao() view returns (address)",
     "function addOwner(address newOwner)",
     "function allowance(address owner, address spender) view returns (uint256)",
     "function approve(address spender, uint256 value) returns (bool)",
     "function balanceOf(address account) view returns (uint256)",
     "function decimals() view returns (uint8)",
     "function has(address _contract, string what) view returns (bool does)",
     "function hasOwner(address _contract) view returns (bool does)",
     "function maxSupply() view returns (uint256)",
     "function mintToCap()",
     "function name() view returns (string)",
     "function owner() view returns (address)",
     "function renounceOwnership(address toRemove)",
     "function symbol() view returns (string)",
     "function totalSupply() view returns (uint256)",
     "function transfer(address to, uint256 value) returns (bool)",
     "function transferFrom(address from, address to, uint256 value) returns (bool)"
  ],
  HECKE: [
    "function Compliment(uint256 Waat) view returns (int256 Longitude, int256 Latitude)",
    "function GetMeridian(uint256 Waat) view returns (uint256 Meridian)",
    "function Meridians(uint256 idx) view returns (uint256 Meridian)",
    "function GetWaat(int256 Latitude) view returns (uint256 Waat)"
  ],
  ZHOU: [
    "function Alpha(string Name, string Symbol) returns (address)",
    "function GetMarketRate(address _a) view returns (uint256)",
    "function Monopole() returns (uint64)",
    "function Purchase(address _t, uint256 _a)",
    "function React(uint64 Iota) returns (tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega))",
    "function Redeem(address _t, uint256 _a)",
    "function Rename(string newName, string newSymbol)",
    "function Type() view returns (string)",
    "function Upsilon() returns (address)",
    "function Xi() returns (uint64)"
  ],
  YI: [
    "function Bang(address _a) view returns (tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega))",
    "function Beta(string Name, string Symbol) returns (address)",
    "function Bing(tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega) _b)",
    "function GetMarketRate(address _a) view returns (uint256)",
    "function Kappa(address Rod, address Cone) returns (address)",
    "function Psi() returns (address)",
    "function Purchase(address _t, uint256 _a)",
    "function React(tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega) Gamma, uint64 Pi) returns (tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega))",
    "function Redeem(address _t, uint256 _a)",
    "function Rename(string newName, string newSymbol)",
    "function Ring() returns (uint64)",
    "function SHAFactoryInterface() returns (address)",
    "function SHIOFactoryInterface() returns (address)",
    "function Type() view returns (string)",
    "function Xi() returns (uint64)"
  ],
  YAU: [
    "function GetMarketRate(address _a) view returns (uint256)",
    "function Monopole() returns (uint64)",
    "function Purchase(address _t, uint256 _a)",
    "function React() returns (tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega))",
    "function Redeem(address _t, uint256 _a)",
    "function Rename(string newName, string newSymbol)",
    "function Shio() returns (address)",
    "function Tau() returns (address)",
    "function Theta() returns (tuple(address Phi, address Mu, uint64 Xi, uint64 Pi, address Shio, uint64 Ring, uint64 Omicron, uint64 Omega))",
    "function Type() view returns (string)"
  ],
  YANG: [
    "function GetMarketRate(address _a) view returns (uint256)",
    "function Mu() returns (address)",
    "function Pole(uint256) returns (uint64)",
    "function Purchase(address _t, uint256 _a)",
    "function Redeem(address _t, uint256 _a)",
    "function Rename(string newName, string newSymbol)",
    "function Rho() returns (tuple(tuple(address,address,uint64,uint64,address,uint64,uint64,uint64) Bang, tuple(address,address,uint64,uint64,address,uint64,uint64,uint64) Lai, tuple(address,address,uint64,uint64,address,uint64,uint64,uint64) Le))",
    "function Type() view returns (string)"
  ],
  SEI: [
     "function Start(address LauToken, string Name, string Symbol) public returns (address Yue, address UserToken)",
     "function Chi() view returns (address Yue, address UserToken)",
     "function Chan() view returns (address)"
  ],
  CHAN: [
     "function Yan(address Origin) view returns (address Yue)",
     "function AddYue(address Origin, address Yue)",
     "function TransferYue(address Yue, address NewOrigin)",
     "function YueWithdraw(address Yue, address Asset, address To, uint256 Amount)",
     "function OptIn(address Contract, bool Allow)"
  ],
  CHOA: [
      "function Play(address UserTokenAddress) returns (address Chi, address UserToken)",
      "function Chat(string MSG) returns (uint256 Charge, uint256 UserQi, uint64 Omicron, uint64 Omega)",
      "function Yuan(address Currency) view returns (uint256 Bae)"
  ],
  RING: [
      "function Eta() returns (uint256 Phoebe, uint256 Iota, uint256 Chao, uint256 Charge)",
      "function Moments(uint64 Soul) view returns (uint256 Iota)",
      "function Pang() view returns (address)",
      "function Phobos() view returns (address)"
  ],
  CHEON: [
      "function Su(address Qing) returns (uint256 Charge, uint256 Hypobar, uint256 Epibar)",
      "function Sei() view returns (address)",
      "function Choa() view returns (address)"
  ],
  META: [
      "function Beat(uint256 QingWaat) returns (uint256 Dione, uint256 Charge, uint256 Deimos, uint256 Yeo)",
      "function Ring() view returns (address)"
  ],
  QI: [
      "function ReactSoul(uint64 Soul) returns (uint256 Qi)",
      "function ReactWaat(uint256 Waat) view returns (uint256 Qi)",
      "function Eris() view returns (address)",
      "function Zuo() view returns (address)"
  ],
  MAI: [
      "function React(uint64 Soul, uint256 QingWaat) returns (uint256 Mai)",
      "function Qi() view returns (address)"
  ],
  XIA: [
      "function Charge(uint256 QingWaat) returns (uint256)",
      "function Fomalhaute() view returns (address)",
      "function Mai() view returns (address)"
  ],
  XIE: [
      "function Power(uint256 QingWaat) returns (uint256 Charge, uint256 Omicron, uint256 Omega)",
      "function Fornax() view returns (address)",
      "function MotzkinPrime() view returns (uint64)",
      "function Xia() view returns (address)"
  ],
  ZI: [
      "function Spin(uint256 QingWaat) returns (uint256 Iota, uint256 Omicron, uint256 Omega, uint256 Eta)",
      "function Tethys() view returns (address)",
      "function Choa() view returns (address)"
  ],
  PANG: [
      "function Push(uint256 QingWaat) returns (uint256 Iota, uint256 Omicron, uint256 Eta, uint256 Omega, uint256 Charge)",
      "function Zi() view returns (address)"
  ],
  GWAT: [
      "function Gwat(address Qing, uint256 Lin) returns (address Mu)",
      "function War() view returns (address)",
      "function Xiao() view returns (address)"
  ],
  WAR: [
      "function Faa(address Caude, uint256 Position) returns (uint256 Waat)",
      "function CO2() view returns (uint256)",
      "function Water() view returns (address)",
      "function World() view returns (address)"
  ],
  H2O: [
      "function Balance() view returns (uint256)",
      "function Mint(address To, uint256 Amount)",
      "function Withdraw(uint256 Amount)"
  ],
  VITUS: [
      "function Balance() view returns (uint256)",
      "function Mint(address To, uint256 Amount)",
      "function Withdraw(uint256 Amount)",
      "function World() view returns (address)"
  ],
  WORLD: [
      "function Code(int256 Latitude, int256 Longitude, address Cause)",
      "function Distribute(address Caude, address Distributive, uint256 Amount) returns (uint256 Remaining)",
      "function Tail(address Caude, uint256 Position) view returns (uint256 Bid)",
      "function Bun(int256 Latitude, int256 Longitude, address Caude) view returns (uint256)",
      "function Buzz(int256 Latitude, address Coder, address Caude) view returns (uint256)",
      "function Cheon() view returns (address)",
      "function Map() view returns (address)",
      "function Meta() view returns (address)",
      "function Vitus() view returns (address)",
      "function Whitelist(address Caude, address Distributive, bool Allow)"
  ],
  LIB_ATTRIBUTE: [
      "function Get(uint64 Soul, string name) view returns (string)",
      "function Set(uint64 Soul, string name, string value)",
      "function Alias(uint64 Soul, address name) view returns (string)",
      "function Alias(uint64 Soul, string name) view returns (string)",
      "function Alias(uint64 Soul, address name, string value)",
      "function Alias(uint64 Soul, string name, string value)",
      "function addAttribute(string name)",
      "function removeAttribute(string name)"
  ],
  LIB_STRINGS: [
      "function String(uint256 value) pure returns (string buffer)",
      "function Hex(uint256 value) pure returns (string)",
      "function Hex(bytes32 value) pure returns (string)",
      "function Hex(address account) pure returns (string)",
      "function CheckPalindrome(string S) pure returns (bool)",
      "function Reverse(string S) pure returns (string Reversed)",
      "function CaseInsensitiveCompare(bytes1 A, bytes1 B) pure returns (bool)",
      "function CheckAcronym(string _A, string _B) pure returns (bool)",
      "function RandomAcronym(uint8 MaxLength) returns (bytes Acronym)",
      "function log10(uint256 value) pure returns (uint256)"
  ]
};

// EXPORTS FOR COMPATIBILITY
export const VOID_ABI = DYSNOMIA_ABIS.VOID;
export const LAU_ABI = DYSNOMIA_ABIS.LAU;
export const CHO_ABI = DYSNOMIA_ABIS.CHO;
export const QING_ABI = DYSNOMIA_ABIS.QING;
export const YUE_ABI = DYSNOMIA_ABIS.YUE;
export const MAP_ABI = DYSNOMIA_ABIS.MAP;
export const HECKE_ABI = DYSNOMIA_ABIS.HECKE;
export const SEI_ABI = DYSNOMIA_ABIS.SEI;
export const CHAN_ABI = DYSNOMIA_ABIS.CHAN;
export const LAU_FACTORY_ABI = DYSNOMIA_ABIS.LAUFactory;
// Add CHEON_ABI here
export const CHEON_ABI = DYSNOMIA_ABIS.CHEON; 
export const GWAT_ABI = DYSNOMIA_ABIS.GWAT;
export const META_ABI = DYSNOMIA_ABIS.META;
export const SHIO_ABI = DYSNOMIA_ABIS.SHIO;
export const SHA_ABI = DYSNOMIA_ABIS.SHA;

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];


// ---------------------------------------------------------------------------
// DOCUMENTATION & CATALOG
// ---------------------------------------------------------------------------

export interface ContractDoc {
    name: string;
    address: string;
    description: string;
    category: 'CORE' | 'DAN' | 'SKY' | 'SOENG' | 'TANG' | 'LIBRARY' | 'TEMPLATE';
    isDynamic?: boolean;
    functionDocs?: Record<string, string>;
}

export const CONTRACT_CATALOG: ContractDoc[] = [
    // CORE
    { 
        name: "VOID", address: ADDRESSES.VOID, category: "CORE", 
        description: "Root session manager. Handles user registration (Enter), chat logging (Log/Chat), and attributes.",
        functionDocs: {
            "Enter": "Register or Login. New users generate a Soul/Aura. Existing users refresh session.",
            "Chat": "Send a message to the public channel (ZHOU). Requires registered username.",
            "SetAttribute": "Store user data (e.g., Username) linked to Soul ID.",
            "AddLibrary": "Register system libraries (Admin only)."
        }
    },
    { 
        name: "SIU", address: ADDRESSES.SIU, category: "CORE", 
        description: "Token Generation & Identity. Mints user tokens and calculates Aura fingerprints.",
        functionDocs: {
            "Miu": "Creates a complete user identity (SHIO pair + Registry). Returns Saat array.",
            "Aura": "Calculates deterministic identity fingerprint from wallet address."
        }
    },
    { name: "YI", address: ADDRESSES.YI, category: "CORE", description: "DeFi Orchestrator. Manages SHA/SHIO factories and Bao operations." },
    { name: "ZHENG", address: ADDRESSES.ZHENG, category: "CORE", description: "Installation Manager. Registers Bao operations into numbered slots." },
    { name: "ZHOU", address: ADDRESSES.ZHOU, category: "CORE", description: "Market Rate Orchestrator. Sets foundational exchange rates." },
    { name: "YAU", address: ADDRESSES.YAU, category: "CORE", description: "Protocol Coordinator. Intermediate state reaction layer." },
    { name: "YANG", address: ADDRESSES.YANG, category: "CORE", description: "Multi-State Aggregator. Maintains Bang/Lai/Le state triad." },
    { name: "LAUFactory", address: ADDRESSES.LAU_FACTORY, category: "CORE", description: "User Factory. Deploys new LAU tokens." },
    { name: "SHAFactory", address: ADDRESSES.SHA_FACTORY, category: "CORE", description: "Factory for SHA contracts." },
    { name: "SHIOFactory", address: ADDRESSES.SHIO_FACTORY, category: "CORE", description: "Factory for SHIO contracts." },

    // DAN (Governance)
    { 
        name: "CHO", address: ADDRESSES.CHO, category: "DAN", 
        description: "Login Gate & Registry. Verifies LAU ownership and tracks user entropy.",
        functionDocs: {
            "Enter": "Authenticate user via LAU token. Updates entropy.",
            "GetUserSoul": "Returns the Soul ID of the caller.",
            "Luo": "Generates unique identifiers for new QINGs."
        }
    },
    { 
        name: "MAP", address: ADDRESSES.MAP, category: "DAN", 
        description: "Geographic Registry. Maps tokens to Hecke coordinates.",
        functionDocs: {
            "New": "Wraps an ERC20 token into a QING venue with a map position.",
            "GetMapQing": "Returns the QING address at specific Lat/Lon coordinates."
        }
    },
    { name: "WAR", address: ADDRESSES.WAR, category: "DAN", description: "Game Mechanics. Territory battles and resource generation (H2O)." },

    // SKY (Network)
    { 
        name: "CHAN", address: ADDRESSES.CHAN, category: "SKY", 
        description: "Channel Manager. Controls YUE banks and opt-in permissions.",
        functionDocs: {
            "OptIn": "Authorize a contract to access your YUE funds.",
            "TransferYue": "Move your YUE bank to a new wallet address."
        }
    },
    { 
        name: "CHOA", address: ADDRESSES.CHOA, category: "SKY", 
        description: "Game Operations. Handles Play() and Chat() with rewards.",
        functionDocs: {
            "Play": "Register LAU to start playing. Mints initial YUE.",
            "Chat": "Send message in a venue. Pays MAI rewards to YUE."
        }
    },
    { name: "RING", address: ADDRESSES.RING, category: "SKY", description: "Time Tracker. Calculates Eta values for territory claims." },

    // TANG (Player)
    { 
        name: "SEI", address: ADDRESSES.SEI, category: "TANG", 
        description: "Onboarding. Creates YUE banks for new players.",
        functionDocs: {
            "Start": "Create or rename your YUE bank.",
            "Chi": "View your linked YUE and LAU addresses."
        }
    },
    { name: "CHEON", address: ADDRESSES.CHEON, category: "TANG", description: "Reward Distributor. Calculates and delivers rewards via Su()." },
    { name: "META", address: ADDRESSES.META, category: "TANG", description: "Meta-Calculator. Computes range and power modifiers (Beat)." },

    // SOENG (Chain)
    { name: "QI", address: ADDRESSES.QI, category: "SOENG", description: "Chain Node 1: Base Energy Calculation." },
    { name: "MAI", address: ADDRESSES.MAI, category: "SOENG", description: "Chain Node 2: Venue-Specific Power." },
    { name: "XIA", address: ADDRESSES.XIA, category: "SOENG", description: "Chain Node 3: Charge Calculation." },
    { name: "XIE", address: ADDRESSES.XIE, category: "SOENG", description: "Chain Node 4: Power Metrics." },
    { name: "ZI", address: ADDRESSES.ZI, category: "SOENG", description: "Chain Node 5: Spin/Rotation." },
    { name: "PANG", address: ADDRESSES.PANG, category: "SOENG", description: "Chain Node 6: Final Push/Thrust." },
    { name: "GWAT", address: ADDRESSES.GWAT, category: "SOENG", description: "Chain Node 7: Derivative QING Creator." },

    // LIBRARIES
    { name: "HECKE", address: ADDRESSES.HECKE, category: "LIBRARY", description: "Coordinate Math Library." },
    { name: "LIB_ATTRIBUTE", address: ADDRESSES.LIB_ATTRIBUTE, category: "LIBRARY", description: "User Attribute Storage Logic." },
    { name: "LIB_STRINGS", address: ADDRESSES.LIB_STRINGS, category: "LIBRARY", description: "String Manipulation Utilities." },

    // TEMPLATES
    { 
        name: "LAU", address: "", category: "TEMPLATE", isDynamic: true,
        description: "User Identity Token. Your avatar and wallet interface.",
        functionDocs: {
            "Chat": "Send message as this user.",
            "Username": "Set or Get display name.",
            "Withdraw": "Move tokens from LAU to wallet.",
            "Void": "Reset session state."
        }
    },
    { 
        name: "QING", address: "", category: "TEMPLATE", isDynamic: true,
        description: "Venue/Territory. Wraps an asset with location and chat.",
        functionDocs: {
            "Join": "Pay cover charge to enter.",
            "Chat": "Broadcast message to venue.",
            "Admitted": "Check access status."
        }
    },
    { 
        name: "YUE", address: "", category: "TEMPLATE", isDynamic: true,
        description: "Player Bank. Holds game assets and handles exchanges.",
        functionDocs: {
            "Hong": "Buy QING tokens.",
            "Hung": "Sell QING tokens.",
            "Withdraw": "Move tokens to wallet (requires CHAN opt-in)."
        }
    },
    { name: "SHA", address: "", category: "TEMPLATE", isDynamic: true, description: "Cryptographic Key Token." },
    { name: "SHIO", address: "", category: "TEMPLATE", isDynamic: true, description: "Paired Cryptographic System." }
];

// ---------------------------------------------------------------------------
// POWER TOKEN CONSTANTS (Addresses derived from documentation)
// ---------------------------------------------------------------------------

export const POWER_TOKENS = {
    ERIS: "0x4d9Ce396BE95dbc5F71808c38107eB7422FD9a03", // QI Address (proxy)
    FOMALHAUTE: "0x7f4a4DD4a6f233d2D82BE38b2F9fc0Fef46f25FA", // XIA Address (proxy)
    FORNAX: "0x4Df51741F2926525A21bF63E4769bA70633D2792", // XIE Address (proxy)
    TETHYS: "0xCbAdd3C3957Bd9D6C036863CB053FEccf3D53338" // ZI Address (proxy)
};
