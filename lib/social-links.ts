export const SOCIAL_NETWORKS={
 telegram:{label:'Telegram',placeholder:'https://t.me/username',hosts:['t.me','telegram.me'],profile:'https://t.me/'},
 vk:{label:'VK',placeholder:'https://vk.com/username',hosts:['vk.com','vk.ru','m.vk.com'],profile:'https://vk.com/'},
 instagram:{label:'Instagram',placeholder:'https://instagram.com/username',hosts:['instagram.com'],profile:'https://instagram.com/'},
 whatsapp:{label:'WhatsApp',placeholder:'https://wa.me/номер',hosts:['wa.me','api.whatsapp.com','whatsapp.com'],profile:''},
 other:{label:'Другая соцсеть',placeholder:'https://…',hosts:[],profile:''},
} as const;
export type SocialNetwork=keyof typeof SOCIAL_NETWORKS;
export type SocialLink={network:SocialNetwork;url:string};
export function normalizeSocialLinks(value:unknown):SocialLink[]{
 if(!Array.isArray(value)||value.length>5)throw Error('Можно добавить до пяти ссылок на соцсети');
 const links:SocialLink[]=[];
 for(const item of value){
  if(!item||typeof item!=='object'||!Object.hasOwn(SOCIAL_NETWORKS,item.network)||typeof item.url!=='string')throw Error('Проверьте ссылки на соцсети');
  const network=item.network as SocialNetwork,config=SOCIAL_NETWORKS[network];let input=item.url.trim();
  if(!input)continue;
  if(input.length>500||/[\s\u0000-\u001f\u007f]/.test(input))throw Error('Проверьте ссылку: '+config.label);
  if(input.startsWith('@')&&config.profile)input=config.profile+input.slice(1);
  else if(!/^[a-z][a-z\d+.-]*:/i.test(input))input='https://'+input;
  let url:URL;try{url=new URL(input);}catch{throw Error('Проверьте ссылку: '+config.label);}
  if(url.href.length>500||url.protocol!=='https:'||url.username||url.password||!url.hostname)throw Error('Для соцсети нужна ссылка https://');
  const host=url.hostname.replace(/^www\./,'');
  if(config.hosts.length&&!(config.hosts as readonly string[]).includes(host))throw Error('Укажите ссылку на '+config.label);
  links.push({network,url:url.href});
 }
 return links;
}
export function readSocialLinks(value:unknown):SocialLink[]{
 try{return normalizeSocialLinks(typeof value==='string'?JSON.parse(value):value??[]);}catch{return [];}
}
