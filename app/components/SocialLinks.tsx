'use client';
import {Camera,ExternalLink,Globe,MessageCircle,Plus,Send,Trash2} from 'lucide-react';
import {SOCIAL_NETWORKS,readSocialLinks,type SocialLink,type SocialNetwork} from '../../lib/social-links';
function NetworkIcon({network}:{network:SocialNetwork}){const Icon=network==='telegram'?Send:network==='instagram'?Camera:network==='whatsapp'?MessageCircle:Globe;return <Icon size={16} aria-hidden="true"/>;}
export function SocialLinks({links}:{links?:SocialLink[]}){
 const saved=readSocialLinks(links);if(!saved.length)return null;
 return <div className="social-links" aria-label="Соцсети">{saved.map((link,i)=><a key={i} href={link.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><NetworkIcon network={link.network}/><span>{link.network==='other'?new URL(link.url).hostname:SOCIAL_NETWORKS[link.network].label}</span><ExternalLink size={12} aria-hidden="true"/></a>)}</div>;
}
export function SocialLinksEditor({value,onChange,disabled}:{value:SocialLink[];onChange:(links:SocialLink[])=>void;disabled:boolean}){
 function update(i:number,patch:Partial<SocialLink>){onChange(value.map((link,index)=>index===i?{...link,...patch}:link));}
 return <fieldset className="social-links-editor" disabled={disabled}><legend>Соцсети</legend>{value.map((link,i)=><div className="social-link-row" key={i}><label><span className="sr-only">Соцсеть {i+1}</span><select value={link.network} onChange={e=>update(i,{network:e.target.value as SocialNetwork})}>{Object.entries(SOCIAL_NETWORKS).map(([key,config])=><option key={key} value={key}>{config.label}</option>)}</select></label><label><span className="sr-only">Ссылка на соцсеть {i+1}</span><input type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" value={link.url} maxLength={500} placeholder={SOCIAL_NETWORKS[link.network].placeholder} onChange={e=>update(i,{url:e.target.value})}/></label><button type="button" className="icon-button" aria-label={'Убрать соцсеть '+(i+1)} onClick={()=>onChange(value.filter((_,index)=>index!==i))}><Trash2 size={17}/></button></div>)}<button type="button" className="text-button add-social-link" disabled={disabled||value.length>=5} onClick={()=>onChange([...value,{network:(Object.keys(SOCIAL_NETWORKS) as SocialNetwork[]).find(n=>!value.some(link=>link.network===n))??'other',url:''}])}><Plus size={16}/>Добавить соцсеть</button></fieldset>;
}
