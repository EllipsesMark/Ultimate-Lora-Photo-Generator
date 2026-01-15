import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, Sparkles, Grid, Layout, CheckCircle2, Loader2, AlertCircle,
  Key, Trash2, Image as ImageIcon, X, Maximize2, Sliders, User,
  ChevronDown, ChevronUp, Fingerprint, DownloadCloud, Lock, Unlock,
  StopCircle, AlertTriangle, History, Terminal, ExternalLink, ShieldCheck, Scissors,
  FileText, FolderOpen, Archive, Tag, RefreshCcw, Wand2, PenLine, ToggleLeft, ToggleRight
} from 'lucide-react';
import JSZip from 'jszip';
import { GeminiService } from './services/geminiService';
import { GeneratedImage, Resolution, CharacterAdjustments, GenerationTask, DatasetGroup } from './types';
import { 
  CLOTHING_LIST, POSE_DEFINITIONS, FACIAL_EXPRESSIONS, 
  EYE_COLOR_OPTIONS, BODY_BUILD_OPTIONS, CHEST_SIZE_OPTIONS, HIP_SIZE_OPTIONS
} from './constants';

interface FailedAsset {
  id: string;
  label: string;
  message: string;
  prompt: string;
  timestamp: number;
}

type ProfileMode = 'auto' | 'manual';

const App: React.FC = () => {
  // --- AUTH STATE ---
  const [userApiKey, setUserApiKey] = useState("");
  const [isKeyConfirmed, setIsKeyConfirmed] = useState(false);

  // --- PROJECT PERSISTENCE STATE ---
  const [projectName, setProjectName] = useState("Character_Alpha");
  const [gallery, setGallery] = useState<GeneratedImage[]>([]);

  // --- PROFILE MODE STATE ---
  const [profileMode, setProfileMode] = useState<ProfileMode>('auto');
  const [manualCharacterProfile, setManualCharacterProfile] = useState("");

  // --- APP STATE ---
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [characterProfile, setCharacterProfile] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [resolution, setResolution] = useState<Resolution>('1K');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [hoveredPoseId, setHoveredPoseId] = useState<string | null>(null);
  const [isBodyLocked, setIsBodyLocked] = useState(false);
  const [isHairLocked, setIsHairLocked] = useState(true);
  const [isZipping, setIsZipping] = useState(false);
  const [failedAssets, setFailedAssets] = useState<FailedAsset[]>([]);
  
  // UI States
  const [clearConfirmMode, setClearConfirmMode] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<DatasetGroup | null>('upper');
  const [selectedPoseIds, setSelectedPoseIds] = useState<Set<string>>(new Set());

  const [adjustments, setAdjustments] = useState<CharacterAdjustments>({
    eyeColor: 'Brown',
    bodyBuild: 'Average',
    chestSize: 'Average',
    hipSize: 'Average'
  });

  const [task, setTask] = useState<GenerationTask>({
    status: 'pending',
    total: 0,
    current: 0,
    images: []
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAbortedRef = useRef(false);

  // Get the active profile based on mode
  const getActiveProfile = (): string | null => {
    if (profileMode === 'auto') {
      return characterProfile;
    } else {
      return manualCharacterProfile.trim() || null;
    }
  };

  // Check if we're ready to generate (have a valid profile)
  const isProfileReady = (): boolean => {
    if (profileMode === 'auto') {
      return !!characterProfile;
    } else {
      return manualCharacterProfile.trim().length > 0;
    }
  };

  // Clear timeout for confirmation mode
  useEffect(() => {
    if (clearConfirmMode) {
      const timer = setTimeout(() => setClearConfirmMode(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [clearConfirmMode]);

  const processFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setSourceImage(base64String);
        // Only auto-analyze if in auto mode
        if (profileMode === 'auto') {
          analyzeImage(base64String.split(',')[1]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => { setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const analyzeImage = async (base64: string) => {
    setIsAnalyzing(true);
    try {
      const profile = await GeminiService.analyzeCharacter(userApiKey, base64);
      setCharacterProfile(profile);
    } catch (err: any) {
      if (err.message.includes("401") || err.message === "API_KEY_EXPIRED") {
        setIsKeyConfirmed(false);
      }
    } finally { setIsAnalyzing(false); }
  };

  const retryAnalysis = () => {
    if (sourceImage) {
      analyzeImage(sourceImage.split(',')[1]);
    }
  };

  const triggerAnalysis = () => {
    if (sourceImage && profileMode === 'auto') {
      analyzeImage(sourceImage.split(',')[1]);
    }
  };

  const stopGeneration = () => {
    isAbortedRef.current = true;
    setTask(prev => ({ ...prev, status: 'stopped' }));
  };

  const deleteImage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setGallery(prev => prev.filter(img => img.id !== id));
  };

  const getLockedIdentityMod = (isPortrait: boolean = false, isSideProfile: boolean = false) => {
    const activeProfile = getActiveProfile();
    if (!activeProfile) return "";
    
    let profile = activeProfile;
    const hairPart = profile.match(/HAIR:\s*([^.]+)/i)?.[1] || "";
    
    if (isPortrait && profile) {
      profile = profile.split('.')
        .filter(s => !s.toLowerCase().includes('body build') && !s.toLowerCase().includes('proportion') && !s.toLowerCase().includes('waist'))
        .join('.');
    }

    const poseConstraint = isSideProfile 
      ? "CRITICAL: Ignore reference orientation; force profile specified in TARGET POSE." 
      : "Preserve identity features and facial structure exactly.";

    let base = `IDENTITY CONSTRAINTS: ${poseConstraint} Eyes: ${adjustments.eyeColor}. Profile: ${profile}.`;
    
    if (isHairLocked && hairPart) {
      base += ` MANDATORY HAIR CONSISTENCY: ${hairPart}. DO NOT ALTER LENGTH OR STYLE.`;
    }

    if (isPortrait) return base;

    if (isBodyLocked) {
      base += ` Keep the exact original body build and proportions from reference image.`;
    } else {
      base += ` Targeted Build: ${adjustments.bodyBuild}, Chest: ${adjustments.chestSize}, Hips: ${adjustments.hipSize}.`;
    }
    
    return base;
  };

  const downloadAll = async () => {
    if (gallery.length === 0) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      gallery.forEach((img, idx) => {
        const base64Data = img.url.split(',')[1];
        if (base64Data) {
          const poseId = img.id.split('-').pop();
          const pose = POSE_DEFINITIONS.find(p => p.id === poseId);
          const poseLabel = pose ? pose.label.replace(/\s+/g, '_') : `Frame_${idx}`;
          const fileName = `${projectName}_${poseLabel}_${idx}.png`;
          zip.file(fileName, base64Data, { base64: true });
        }
      });
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `${projectName}_Dataset_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error("Zipping failed", error);
    } finally {
      setIsZipping(false);
    }
  };

  const executeClearBin = () => {
    setGallery([]);
    setTask({ status: 'pending', total: 0, current: 0, images: [] });
    setFailedAssets([]);
    setClearConfirmMode(false);
  };

  const handleClearClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!clearConfirmMode) {
      setClearConfirmMode(true);
    } else {
      executeClearBin();
    }
  };

  const startDatasetMode = async () => {
    if (!sourceImage || !isProfileReady() || !isKeyConfirmed || selectedPoseIds.size === 0) return;
    isAbortedRef.current = false;
    
    setTask({ status: 'generating', total: selectedPoseIds.size, current: 0, images: [] });
    setFailedAssets([]);

    const selectedPoses = POSE_DEFINITIONS.filter(p => selectedPoseIds.has(p.id));
    
    for (const pose of selectedPoses) {
      if (isAbortedRef.current) break;
      
      const isPortrait = pose.group === 'portrait';
      const descLower = pose.description.toLowerCase();
      const isSideProfile = descLower.includes('90-degree') || descLower.includes('profile');
      const identityMod = getLockedIdentityMod(isPortrait, isSideProfile);
      const clothing = CLOTHING_LIST[Math.floor(Math.random() * CLOTHING_LIST.length)];
      
      const expressionKeywords = [
        "smile", "smirk", "laugh", "teeth", "wink", "gaze", 
        "thoughtful", "serene", "nose", "lip", "joy", "fear", 
        "anxious", "vulnerable", "stern", "desperate", "exhaustion", 
        "serene", "concentrated", "neutral", "stoic", "pensive", "rembrandt"
      ];
      const hasExpressionInPose = expressionKeywords.some(kw => descLower.includes(kw));

      const expression = hasExpressionInPose 
        ? "" 
        : (isPortrait || pose.group === 'upper') 
            ? FACIAL_EXPRESSIONS[Math.floor(Math.random() * FACIAL_EXPRESSIONS.length)] 
            : "neutral gaze";
      
      const ar = pose.group === 'full' ? "3:4" : "1:1";
      
      // UPGRADED: Stronger direction control for rear, 45°, and profile poses
      let directionMod = "";

      const isRear = descLower.includes('rear') || descLower.includes('behind') || descLower.includes('back view') || descLower.includes('view from behind');
      const isOverShoulder = descLower.includes('looking back at camera');
      const isLeft = descLower.includes('left');
      const isRight = descLower.includes('right');
      const isProfile = descLower.includes('90') || descLower.includes('profile');
      const is45 = descLower.includes('45');
      // STRICT FRONTAL: Only triggered if no other directionality is found and explicit frontal keywords exist
      const isFrontal = (descLower.includes('frontal') || (descLower.includes('center') && !descLower.includes('behind'))) && !isLeft && !isRight && !isRear;

      if (isRear || is45 || isProfile || isLeft || isRight) {
        let base = "CRITICAL: SHOT ORIENTATION — ";

        if (isRear) {
          base += "Rear view. Subject is facing away from camera. ";
          if (isLeft) base += "Camera positioned behind and to the right — seeing back of head and left side only. ";
          if (isRight) base += "Camera positioned behind and to the left — seeing back of head and right side only. ";
        } else if (isProfile) {
          base += "Strict 90-degree side profile. ";
          if (isLeft) base += "Facing screen-left. Only left profile visible. ";
          if (isRight) base += "Facing screen-right. Only right profile visible. ";
        } else if (is45 || isLeft || isRight) {
          base += "Angled orientation. ";
          if (isLeft) base += "Subject facing screen-left. ";
          if (isRight) base += "Subject facing screen-right. ";
        }

        if (isOverShoulder) {
          base += "Subject is looking back at the camera over their shoulder, but primary body orientation is maintained. ";
        }

        base += "ABSOLUTELY NO FULL FRONTAL FACE. DO NOT TURN SUBJECT TOWARD CAMERA.";
        directionMod = base;

      } else if (isFrontal) {
        directionMod = "Direct frontal view. Subject looking straight into camera with both eyes fully visible and centered.";
      }
      
      const framingMod = isPortrait 
        ? "85mm lens, Tight headshot, shoulder-up framing only, clear facial features, bokeh studio background." 
        : "Professional framing, standard lens.";

      let prompt = `DATASET PRODUCTION. ${directionMod ? `${directionMod} ` : ''}TARGET POSE: ${pose.description}. COMPOSITION: ${framingMod}. ${expression ? `EXPRESSION: ${expression}. ` : ''}CLOTHING: ${clothing}. ${identityMod}. ENVIRONMENT: Professional neutral high-key studio, seamless gray backdrop. 8k resolution, high detail.`;
      
      try {
        const imageUrl = await GeminiService.generateCharacterImage(userApiKey, sourceImage, prompt, resolution, ar);
        
        const newImage: GeneratedImage = { 
          id: `dataset-${Date.now()}-${pose.id}`, 
          url: imageUrl, 
          prompt, 
          timestamp: Date.now(), 
          group: pose.group 
        };

        setSelectedPoseIds(prev => {
          const next = new Set(prev);
          next.delete(pose.id);
          return next;
        });

        setGallery(prev => [newImage, ...prev]);
        setTask(prev => ({
          ...prev,
          current: prev.current + 1,
          images: [newImage, ...prev.images]
        }));
      } catch (err: any) {
        if (err.message.includes("401") || err.message === "API_KEY_EXPIRED") {
          setIsKeyConfirmed(false);
          setTask(prev => ({ ...prev, error: err.message, status: 'failed' }));
          return;
        }

        setFailedAssets(prev => [{
          id: `failed-${Date.now()}-${pose.id}`,
          label: pose.label,
          message: err.message,
          prompt: prompt,
          timestamp: Date.now()
        }, ...prev]);

        setTask(prev => ({ ...prev, current: prev.current + 1 }));
      }
    }
    if (!isAbortedRef.current) setTask(prev => ({ ...prev, status: 'completed' }));
  };

  const selectRecommended702010 = () => {
    const next = new Set<string>();
    POSE_DEFINITIONS.forEach(p => next.add(p.id));
    setSelectedPoseIds(next);
  };

  const togglePoseSelection = (id: string) => {
    setSelectedPoseIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroupAll = (group: DatasetGroup) => {
    const groupPoses = POSE_DEFINITIONS.filter(p => p.group === group);
    const allSelected = groupPoses.every(p => selectedPoseIds.has(p.id));
    setSelectedPoseIds(prev => {
      const next = new Set(prev);
      if (allSelected) groupPoses.forEach(p => next.delete(p.id));
      else groupPoses.forEach(p => next.add(p.id));
      return next;
    });
  };

  const resetAll = () => {
    if (window.confirm("Reset entire studio workspace? This does NOT clear your saved Bin images.")) {
      setSourceImage(null);
      setCharacterProfile(null);
      setManualCharacterProfile("");
      setTask({ status: 'pending', total: 0, current: 0, images: [] });
      setSelectedPoseIds(new Set());
      setFailedAssets([]);
      setIsBodyLocked(false);
      setIsHairLocked(true);
    }
  };

  const handleModeSwitch = (mode: ProfileMode) => {
    setProfileMode(mode);
    // If switching to auto and we have an image but no profile, trigger analysis
    if (mode === 'auto' && sourceImage && !characterProfile) {
      analyzeImage(sourceImage.split(',')[1]);
    }
  };

  const binGroupedImages = gallery.reduce((acc, img) => {
    const key = img.group || 'default';
    if (!acc[key]) acc[key] = [];
    acc[key].push(img);
    return acc;
  }, {} as Record<string, GeneratedImage[]>);

  const groupLabels: Record<string, string> = {
    portrait: 'Portrait',
    upper: 'Upper Body',
    full: 'Full Body'
  };

  if (!isKeyConfirmed) {
    return (
      <div className="min-h-screen bg-[#060606] flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[150px] rounded-full" />
        
        <div className="max-w-2xl w-full relative z-10 animate-in fade-in zoom-in-95 duration-1000">
          <div className="bg-[#111]/40 backdrop-blur-4xl border border-white/5 rounded-[4rem] p-16 shadow-6xl ring-1 ring-white/10 text-center space-y-12">
            <div className="flex justify-center">
               <div className="p-8 bg-gradient-to-tr from-emerald-600 to-emerald-400 rounded-[2.5rem] shadow-2xl shadow-emerald-500/20 relative">
                 <Fingerprint className="w-16 h-16 text-white" />
                 <div className="absolute -top-2 -right-2 bg-black rounded-full p-2 border border-white/10"><ShieldCheck className="w-6 h-6 text-emerald-400" /></div>
               </div>
            </div>
            
            <div className="space-y-6">
              <h1 className="text-5xl font-black tracking-tighter text-white uppercase leading-none">Authorization<br/><span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-emerald-200">Matrix Lock</span></h1>
              <p className="text-neutral-400 text-lg font-medium leading-relaxed italic px-10">
                To access the 4K generation pipeline, you must enter a valid Google Gemini API Key.
              </p>
            </div>

            <div className="space-y-4">
              <input 
                type="password"
                placeholder="Paste your Gemini API Key here..."
                className="w-full bg-[#0a0a0a] border border-white/10 focus:border-emerald-500/50 rounded-[2.5rem] px-8 py-6 text-center text-emerald-400 font-mono text-lg outline-none"
                value={userApiKey}
                onChange={(e) => setUserApiKey(e.target.value)}
              />
              
              <button 
                onClick={() => { if(userApiKey) setIsKeyConfirmed(true); }}
                disabled={!userApiKey}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-8 rounded-[2.5rem] text-lg font-black uppercase tracking-[0.2em] transition-all shadow-5xl active:scale-95 flex items-center justify-center gap-4"
              >
                <Key className="w-6 h-6" />
                Initialize System
              </button>
              
              <a 
                href="https://ai.google.dev/gemini-api/docs/billing" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 text-[11px] font-black text-neutral-600 hover:text-emerald-400 uppercase tracking-widest transition-colors py-4 group"
              >
                Get API Key <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all" />
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#060606]">
      {selectedImage && (
        <div className="fixed inset-0 z-[100] bg-black/98 flex items-center justify-center p-4 backdrop-blur-2xl" onClick={() => setSelectedImage(null)}>
          <div className="relative max-w-7xl w-full max-h-[92vh] flex flex-col gap-6" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedImage(null)} className="absolute -top-16 right-0 p-4 text-white/20 hover:text-white transition-all"><X className="w-12 h-12" /></button>
            <div className="relative group/zoom flex justify-center overflow-hidden rounded-[3rem] border border-white/10 ring-12 ring-white/5 shadow-6xl">
              <img src={selectedImage.url} alt="Asset Inspect" className="max-h-[72vh] w-auto object-contain" />
              <div className="absolute top-8 right-8 bg-black/60 backdrop-blur-md px-5 py-2 rounded-full border border-white/10 text-[10px] font-black uppercase tracking-widest text-emerald-400">PROCESSED @ {resolution}</div>
            </div>
            <div className="bg-[#111]/95 backdrop-blur-3xl p-12 rounded-[2.5rem] border border-white/5 shadow-2xl flex items-center justify-between">
              <div className="space-y-4">
                <div className="flex items-center gap-3"><Fingerprint className="w-6 h-6 text-emerald-500" /><p className="text-[12px] font-black text-emerald-400 uppercase tracking-[0.5em]">Identity Token Matrix</p></div>
                <p className="text-sm text-neutral-500 italic leading-relaxed max-w-5xl line-clamp-2">{selectedImage.prompt}</p>
              </div>
              <button onClick={() => { 
                const link = document.createElement('a'); 
                link.href = selectedImage.url; 
                const poseId = selectedImage.id.split('-').pop();
                link.download = `${projectName}_${poseId}.png`; 
                link.click(); 
              }} className="bg-emerald-600 text-white px-12 py-6 rounded-2xl text-[13px] font-black uppercase tracking-widest transition-all hover:bg-emerald-500 shadow-3xl">Download Original</button>
            </div>
          </div>
        </div>
      )}

      <header className="border-b border-white/5 bg-black/40 backdrop-blur-2xl sticky top-0 z-50">
        <div className="container mx-auto px-10 h-28 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="p-5 bg-gradient-to-tr from-emerald-600 to-emerald-400 rounded-2xl shadow-2xl shadow-emerald-500/10"><Sparkles className="w-8 h-8 text-white" /></div>
            <div>
              <h1 className="text-3xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-emerald-300 to-blue-400 uppercase">Ultimate LoRA Photo Generator</h1>
              <div className="flex items-center gap-4 mt-2">
                <p className="text-[10px] text-neutral-600 font-bold uppercase tracking-[0.4em] leading-none">v3.4 Pipeline</p>
                <div className="h-3 w-[1px] bg-white/10" />
                <div className="flex items-center gap-2 group">
                  <Tag className="w-3.5 h-3.5 text-neutral-600 group-hover:text-emerald-500 transition-colors" />
                  <p className="text-[11px] font-black text-emerald-400 uppercase tracking-[0.2em]">{projectName || "UNNAMED_ASSET"}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-10">
            {gallery.length > 0 && (
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleClearClick}
                  className={`flex items-center gap-3 px-6 py-4 rounded-full transition-all text-[11px] font-black uppercase tracking-widest border shadow-lg ${clearConfirmMode ? 'bg-red-600 border-red-400 text-white scale-110' : 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20'}`}
                  title="Clear Production Bin"
                >
                  <Trash2 className="w-5 h-5" />
                  {clearConfirmMode && "Sure?"}
                </button>
                <button 
                  onClick={downloadAll} 
                  disabled={isZipping}
                  className="flex items-center gap-3 px-8 py-4 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full hover:bg-emerald-500/20 transition-all text-[12px] font-black uppercase tracking-widest disabled:opacity-50 shadow-lg shadow-emerald-500/5"
                >
                  {isZipping ? <Loader2 className="w-5 h-5 animate-spin" /> : <Archive className="w-5 h-5" />}
                  {isZipping ? 'Bundling...' : `Export Bin (${gallery.length})`}
                </button>
              </div>
            )}
            <div className="flex bg-neutral-900/30 rounded-full p-2 border border-white/5 shadow-inner">
              {(['1K', '2K', '4K'] as Resolution[]).map((res) => (
                <button key={res} onClick={() => setResolution(res)} className={`px-8 py-3 rounded-full text-[12px] font-black transition-all ${resolution === res ? 'bg-emerald-500 text-white shadow-2xl' : 'text-neutral-500 hover:text-neutral-300'}`}>{res}</button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto p-10 lg:p-14">
        {task.status === 'generating' && (
          <div className="relative mb-12 bg-[#121212]/95 backdrop-blur-4xl rounded-[3rem] p-10 border border-emerald-500/30 shadow-6xl animate-in slide-in-from-top-10 duration-700 overflow-hidden">
             <div className="flex flex-col md:flex-row items-center gap-12">
                <div className="flex items-center gap-8 md:border-r border-white/10 md:pr-12">
                   <div className="p-5 bg-emerald-500/10 rounded-2xl border border-emerald-500/20"><Loader2 className="w-10 h-10 text-emerald-400 animate-spin" /></div>
                   <div>
                     <p className="text-[12px] font-black text-emerald-500 uppercase tracking-[0.5em]">Synthesis Protocol Active</p>
                     <p className="text-2xl font-black text-white tabular-nums tracking-tighter">{task.current} / {task.total} <span className="text-neutral-600 text-sm ml-2 font-bold uppercase tracking-widest">Frames</span></p>
                   </div>
                </div>
                <div className="flex-1 w-full space-y-4">
                   <div className="flex justify-between items-end px-2"><span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Pipeline Saturation</span><span className="text-[12px] font-black text-emerald-400">{Math.round((task.current / task.total) * 100)}%</span></div>
                   <div className="w-full h-5 bg-black/60 rounded-full overflow-hidden border border-white/5 p-1 shadow-inner relative"><div className="h-full bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-400 transition-all duration-1000 ease-out rounded-full shadow-[0_0_20px_rgba(16,185,129,0.3)]" style={{ width: `${(task.current / task.total) * 100}%` }} /></div>
                </div>
                <button onClick={stopGeneration} className="flex items-center gap-5 bg-red-500/10 hover:bg-red-500/20 text-red-500 px-12 py-7 rounded-[2.5rem] text-[13px] font-black uppercase tracking-widest border border-red-500/30 transition-all active:scale-95"><StopCircle className="w-6 h-6" /> Stop Batch</button>
             </div>
          </div>
        )}

        {!sourceImage && profileMode === 'auto' ? (
          <div className="max-w-6xl mx-auto mt-24 animate-in fade-in slide-in-from-bottom-16 duration-1000">
            {/* Mode Toggle at Top */}
            <div className="flex justify-center mb-12">
              <div className="inline-flex bg-black/60 rounded-full p-2 border border-white/10 shadow-2xl">
                <button 
                  onClick={() => handleModeSwitch('auto')}
                  className={`flex items-center gap-3 px-10 py-5 rounded-full text-[12px] font-black uppercase tracking-widest transition-all ${profileMode === 'auto' ? 'bg-emerald-500 text-white shadow-xl' : 'text-neutral-500 hover:text-neutral-300'}`}
                >
                  <Wand2 className="w-5 h-5" />
                  Auto-Analyze
                </button>
                <button 
                  onClick={() => handleModeSwitch('manual')}
                  className={`flex items-center gap-3 px-10 py-5 rounded-full text-[12px] font-black uppercase tracking-widest transition-all ${profileMode === 'manual' ? 'bg-violet-500 text-white shadow-xl' : 'text-neutral-500 hover:text-neutral-300'}`}
                >
                  <PenLine className="w-5 h-5" />
                  Manual Profile
                </button>
              </div>
            </div>

            <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()} className={`group relative cursor-pointer aspect-[24/10] border-3 border-dashed rounded-[5rem] flex flex-col items-center justify-center gap-12 transition-all duration-1000 overflow-hidden ${isDragging ? 'border-emerald-500 bg-emerald-500/10 scale-[1.02]' : 'border-neutral-900 bg-neutral-900/10 hover:border-neutral-800'}`}>
              <div className="p-12 bg-black/50 rounded-[3rem] border border-white/5 shadow-4xl group-hover:scale-110 transition-transform duration-1000"><Upload className={`w-20 h-20 ${isDragging ? 'text-emerald-400' : 'text-neutral-700 group-hover:text-neutral-400'}`} /></div>
              <div className="text-center space-y-5 z-10 px-10"><p className="text-5xl font-black text-neutral-200 tracking-tighter uppercase">Drag and Drop your image here</p><p className="text-lg text-neutral-600 font-medium italic tracking-wide">Drop your character's image here. For best results, ensure the face is clear and the body shape is visible.</p></div>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
            </div>
          </div>
        ) : !sourceImage && profileMode === 'manual' ? (
          <div className="max-w-6xl mx-auto mt-16 animate-in fade-in slide-in-from-bottom-16 duration-1000 space-y-12">
            {/* Mode Toggle at Top */}
            <div className="flex justify-center">
              <div className="inline-flex bg-black/60 rounded-full p-2 border border-white/10 shadow-2xl">
                <button 
                  onClick={() => handleModeSwitch('auto')}
                  className={`flex items-center gap-3 px-10 py-5 rounded-full text-[12px] font-black uppercase tracking-widest transition-all ${profileMode === 'auto' ? 'bg-emerald-500 text-white shadow-xl' : 'text-neutral-500 hover:text-neutral-300'}`}
                >
                  <Wand2 className="w-5 h-5" />
                  Auto-Analyze
                </button>
                <button 
                  onClick={() => handleModeSwitch('manual')}
                  className={`flex items-center gap-3 px-10 py-5 rounded-full text-[12px] font-black uppercase tracking-widest transition-all ${profileMode === 'manual' ? 'bg-violet-500 text-white shadow-xl' : 'text-neutral-500 hover:text-neutral-300'}`}
                >
                  <PenLine className="w-5 h-5" />
                  Manual Profile
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              {/* Image Upload (Optional in Manual Mode) */}
              <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()} className={`group relative cursor-pointer aspect-square border-3 border-dashed rounded-[4rem] flex flex-col items-center justify-center gap-8 transition-all duration-1000 overflow-hidden ${isDragging ? 'border-violet-500 bg-violet-500/10 scale-[1.02]' : 'border-neutral-900 bg-neutral-900/10 hover:border-neutral-800'}`}>
                <div className="p-10 bg-black/50 rounded-[2.5rem] border border-white/5 shadow-4xl group-hover:scale-110 transition-transform duration-1000"><Upload className={`w-16 h-16 ${isDragging ? 'text-violet-400' : 'text-neutral-700 group-hover:text-neutral-400'}`} /></div>
                <div className="text-center space-y-4 z-10 px-8">
                  <p className="text-3xl font-black text-neutral-200 tracking-tighter uppercase">Reference Image</p>
                  <p className="text-sm text-neutral-600 font-medium italic tracking-wide">Upload a reference image for the AI to work from</p>
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-full">
                    <span className="text-[10px] font-black text-violet-400 uppercase tracking-widest">Required for generation</span>
                  </div>
                </div>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
              </div>

              {/* Manual Profile Input */}
              <div className="bg-[#111]/30 border border-white/5 rounded-[4rem] p-10 shadow-4xl backdrop-blur-3xl space-y-8">
                <div className="flex items-center gap-5">
                  <div className="p-4 bg-violet-500/10 rounded-2xl border border-violet-500/20">
                    <PenLine className="w-8 h-8 text-violet-400" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-neutral-200 uppercase tracking-tight">Character Profile</h2>
                    <p className="text-[11px] text-neutral-600 font-bold uppercase tracking-[0.3em]">Describe your character in detail</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <textarea
                    value={manualCharacterProfile}
                    onChange={(e) => setManualCharacterProfile(e.target.value)}
                    placeholder="Describe your character's appearance in detail...

Example:
25-year-old woman with long flowing platinum blonde hair reaching mid-back, bright green eyes with gold flecks, high cheekbones, soft feminine features, light skin with subtle freckles across the nose, athletic build with toned arms, medium height around 5'6..."
                    className="w-full h-80 bg-black/60 border border-white/10 focus:border-violet-500/50 rounded-3xl px-8 py-6 text-neutral-300 text-sm leading-relaxed outline-none resize-none placeholder:text-neutral-700 placeholder:italic"
                  />
                  
                  <div className="flex items-center justify-between px-4">
                    <span className="text-[10px] font-black text-neutral-600 uppercase tracking-widest">
                      {manualCharacterProfile.length} characters
                    </span>
                    {manualCharacterProfile.trim().length > 0 && (
                      <div className="flex items-center gap-2 text-violet-400">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Profile Ready</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-6 bg-violet-500/5 border border-violet-500/10 rounded-2xl space-y-3">
                  <p className="text-[11px] font-black text-violet-400 uppercase tracking-widest">Tips for Best Results</p>
                  <ul className="text-[12px] text-neutral-500 space-y-2 leading-relaxed">
                    <li>• Include HAIR details: color, length, style, texture</li>
                    <li>• Describe FACE: eye color, facial structure, skin tone</li>
                    <li>• Specify BODY: build, proportions, notable features</li>
                    <li>• Add AGE and overall vibe/aesthetic</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
            <div className="lg:col-span-4 space-y-12">
              <div className="bg-[#111]/30 border border-white/5 rounded-[4rem] p-12 shadow-4xl backdrop-blur-3xl">
                <div className="flex items-center justify-between mb-10">
                  <h2 className="text-[12px] font-black text-neutral-600 uppercase tracking-[0.5em]">Anchor DNA</h2>
                  <button onClick={resetAll} className="p-4 hover:bg-red-500/10 text-neutral-800 hover:text-red-500 rounded-2xl transition-all"><Trash2 className="w-6 h-6" /></button>
                </div>

                {/* Mode Toggle */}
                <div className="mb-10">
                  <div className="flex bg-black/60 rounded-full p-1.5 border border-white/10 shadow-inner">
                    <button 
                      onClick={() => handleModeSwitch('auto')}
                      className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${profileMode === 'auto' ? 'bg-emerald-500 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-300'}`}
                    >
                      <Wand2 className="w-4 h-4" />
                      Auto
                    </button>
                    <button 
                      onClick={() => handleModeSwitch('manual')}
                      className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${profileMode === 'manual' ? 'bg-violet-500 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-300'}`}
                    >
                      <PenLine className="w-4 h-4" />
                      Manual
                    </button>
                  </div>
                </div>
                
                <div className="mb-12 space-y-10">
                  <div className="p-8 bg-black/40 rounded-[2.5rem] border-2 border-emerald-500/20 shadow-2xl space-y-4 animate-in slide-in-from-top-4 duration-700">
                    <label className="text-[10px] font-black text-emerald-500/70 uppercase tracking-[0.4em] px-2 flex items-center gap-3">
                      <Fingerprint className="w-4 h-4" /> Character Designation
                    </label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '_'))}
                        className="w-full bg-black/60 border border-white/10 focus:border-emerald-500 rounded-2xl px-8 py-6 text-emerald-400 font-black uppercase tracking-[0.2em] outline-none transition-all shadow-xl text-center text-lg"
                        placeholder="ENTER_NAME_HERE"
                      />
                      <div className="absolute -top-3 -right-3 bg-emerald-500 text-black rounded-full p-2 border border-black shadow-lg">
                        <Tag className="w-3 h-3" />
                      </div>
                    </div>
                  </div>

                  <div className="relative group rounded-[3rem] overflow-hidden border border-white/5 shadow-5xl ring-1 ring-white/5">
                    <img src={sourceImage} alt="Anchor Source" className="w-full aspect-square object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-transparent to-transparent" />
                    <div className="absolute bottom-10 left-10 px-6 py-2.5 bg-emerald-500/90 rounded-full text-[12px] font-black uppercase tracking-widest text-white">Comp Secured</div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setIsHairLocked(!isHairLocked)} className={`flex items-center justify-center gap-3 py-4 rounded-2xl border transition-all ${isHairLocked ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10'}`}>
                      {isHairLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                      <span className="text-[11px] font-black uppercase tracking-widest">Hair Lock</span>
                    </button>
                    <button onClick={() => setIsBodyLocked(!isBodyLocked)} className={`flex items-center justify-center gap-3 py-4 rounded-2xl border transition-all ${isBodyLocked ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10'}`}>
                      {isBodyLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                      <span className="text-[11px] font-black uppercase tracking-widest">Body Lock</span>
                    </button>
                  </div>
                </div>

                {/* AUTO MODE: Show analyzer status */}
                {profileMode === 'auto' && (
                  <>
                    {isAnalyzing ? (
                      <div className="flex items-center gap-6 text-emerald-400 bg-emerald-500/5 p-10 rounded-[2.5rem] border border-emerald-500/10 animate-pulse"><Loader2 className="w-8 h-8 animate-spin" /><span className="text-[13px] font-black uppercase tracking-[0.4em]">Deconstructing Identity...</span></div>
                    ) : characterProfile ? (
                      <div className="p-10 bg-emerald-500/5 rounded-[2.5rem] border border-emerald-500/10 space-y-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 text-emerald-400">
                            <CheckCircle2 className="w-7 h-7" />
                            <span className="text-[13px] font-black uppercase tracking-widest">Bio-Profile Locked</span>
                          </div>
                          <button 
                            onClick={retryAnalysis}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-emerald-500/10 border border-white/10 rounded-xl text-neutral-400 hover:text-emerald-400 transition-all group"
                          >
                            <RefreshCcw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-700" />
                            <span className="text-[9px] font-black uppercase">Re-Analyze</span>
                          </button>
                        </div>
                        <p className="text-[13px] text-neutral-600 leading-relaxed font-medium italic overflow-y-auto max-h-56 pr-5 custom-scrollbar">{characterProfile}</p>
                        <div className="flex gap-2">
                            {isHairLocked && <div className="px-3 py-1 bg-emerald-500/20 rounded-lg border border-emerald-500/30 flex items-center gap-2"><Scissors className="w-3.5 h-3.5 text-emerald-400" /><span className="text-[9px] font-black text-emerald-400">HAIR_FIXED</span></div>}
                            {isBodyLocked && <div className="px-3 py-1 bg-emerald-500/20 rounded-lg border border-emerald-500/30 flex items-center gap-2"><User className="w-3.5 h-3.5 text-emerald-400" /><span className="text-[9px] font-black text-emerald-400">FRAME_FIXED</span></div>}
                        </div>
                      </div>
                    ) : (
                      <div className="p-10 bg-amber-500/5 rounded-[2.5rem] border border-amber-500/10 space-y-6">
                        <div className="flex items-center gap-4 text-amber-400">
                          <AlertCircle className="w-7 h-7" />
                          <span className="text-[13px] font-black uppercase tracking-widest">No Profile Detected</span>
                        </div>
                        <button 
                          onClick={triggerAnalysis}
                          className="w-full flex items-center justify-center gap-3 py-5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-2xl text-amber-400 transition-all"
                        >
                          <Wand2 className="w-5 h-5" />
                          <span className="text-[12px] font-black uppercase tracking-widest">Run Analyzer</span>
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* MANUAL MODE: Show editable text area */}
                {profileMode === 'manual' && (
                  <div className="p-8 bg-violet-500/5 rounded-[2.5rem] border border-violet-500/10 space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-violet-400">
                        <PenLine className="w-6 h-6" />
                        <span className="text-[13px] font-black uppercase tracking-widest">Manual Profile</span>
                      </div>
                      {manualCharacterProfile.trim().length > 0 && (
                        <div className="flex items-center gap-2 text-violet-400">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-[9px] font-black uppercase tracking-widest">Ready</span>
                        </div>
                      )}
                    </div>
                    
                    <textarea
                      value={manualCharacterProfile}
                      onChange={(e) => setManualCharacterProfile(e.target.value)}
                      placeholder="Describe your character's appearance...

Include details like:
• Hair: color, length, style
• Eyes: color, shape
• Face: structure, skin tone
• Body: build, proportions
• Age and overall aesthetic"
                      className="w-full h-48 bg-black/40 border border-white/10 focus:border-violet-500/50 rounded-2xl px-6 py-5 text-neutral-300 text-[13px] leading-relaxed outline-none resize-none placeholder:text-neutral-700 placeholder:italic"
                    />

                    <div className="flex items-center justify-between px-2">
                      <span className="text-[10px] font-black text-neutral-600 uppercase tracking-widest">
                        {manualCharacterProfile.length} chars
                      </span>
                      <div className="flex gap-2">
                        {isHairLocked && <div className="px-3 py-1 bg-violet-500/20 rounded-lg border border-violet-500/30 flex items-center gap-2"><Scissors className="w-3.5 h-3.5 text-violet-400" /><span className="text-[9px] font-black text-violet-400">HAIR_FIXED</span></div>}
                        {isBodyLocked && <div className="px-3 py-1 bg-violet-500/20 rounded-lg border border-violet-500/30 flex items-center gap-2"><User className="w-3.5 h-3.5 text-violet-400" /><span className="text-[9px] font-black text-violet-400">FRAME_FIXED</span></div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {isProfileReady() && (
                <div className="bg-[#111]/30 border border-white/5 rounded-[4rem] p-12 shadow-4xl backdrop-blur-3xl space-y-12">
                  <div className="flex items-center gap-5"><Sliders className="w-7 h-7 text-emerald-400" /><h2 className="text-[12px] font-black text-neutral-600 uppercase tracking-[0.5em]">Identity Fine-Tuning</h2></div>
                  <div className="space-y-10">
                    <div className={`space-y-5 transition-all duration-300 ${isBodyLocked ? 'opacity-30 pointer-events-none grayscale' : ''}`}><label className="text-[12px] font-black text-neutral-600 uppercase tracking-widest tracking-[0.3em] px-2">Chest Matrix</label><div className="grid grid-cols-2 gap-4">{CHEST_SIZE_OPTIONS.map(opt => <button key={opt} onClick={() => setAdjustments(p => ({...p, chestSize: opt}))} className={`px-6 py-5 rounded-2xl text-[12px] font-black border transition-all ${adjustments.chestSize === opt ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-black/40 border-white/5 text-neutral-600 hover:border-white/10'}`}>{opt}</button>)}</div></div>
                    <div className={`space-y-5 transition-all duration-300 ${isBodyLocked ? 'opacity-30 pointer-events-none grayscale' : ''}`}><label className="text-[12px] font-black text-neutral-600 uppercase tracking-widest tracking-[0.3em] px-2">Hip Matrix</label><div className="grid grid-cols-2 gap-4">{HIP_SIZE_OPTIONS.map(opt => <button key={opt} onClick={() => setAdjustments(p => ({...p, hipSize: opt}))} className={`px-6 py-5 rounded-2xl text-[12px] font-black border transition-all ${adjustments.hipSize === opt ? 'bg-teal-500/10 border-teal-500 text-teal-400' : 'bg-black/40 border-white/5 text-neutral-600 hover:border-white/10'}`}>{opt}</button>)}</div></div>
                    <div className="space-y-5"><label className="text-[12px] font-black text-neutral-600 uppercase tracking-widest tracking-[0.3em] px-2">Ocular Hue</label><select value={adjustments.eyeColor} onChange={e => setAdjustments(p => ({...p, eyeColor: e.target.value}))} className="w-full bg-black/60 border border-white/5 rounded-2xl px-8 py-6 text-sm font-black text-neutral-400 appearance-none shadow-xl">{EYE_COLOR_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                    <div className={`space-y-5 transition-all duration-300 ${isBodyLocked ? 'opacity-30 pointer-events-none grayscale' : ''}`}><label className="text-[12px] font-black text-neutral-600 uppercase tracking-widest tracking-[0.3em] px-2">Physiology Type</label><div className="grid grid-cols-2 gap-4">{BODY_BUILD_OPTIONS.map(opt => <button key={opt} onClick={() => setAdjustments(p => ({...p, bodyBuild: opt}))} className={`px-6 py-5 rounded-2xl text-[12px] font-black border transition-all ${adjustments.bodyBuild === opt ? 'bg-blue-600/10 border-blue-500 text-blue-400' : 'bg-black/40 border-white/5 text-neutral-600 hover:border-white/10'}`}>{opt}</button>)}</div></div>
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-8 space-y-16">
              {isProfileReady() && (
                <div className="bg-[#0e0e0e] border border-white/5 rounded-[5rem] overflow-hidden shadow-6xl transition-all duration-1000">
                  <div className="p-14 border-b border-white/5 flex items-center justify-between bg-black/20">
                    <div className="flex items-center gap-8">
                      <div className={`p-6 rounded-[2.5rem] border shadow-2xl ${profileMode === 'auto' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-violet-500/10 border-violet-500/20'}`}>
                        <Grid className={`w-10 h-10 ${profileMode === 'auto' ? 'text-emerald-400' : 'text-violet-400'}`} />
                      </div>
                      <div>
                        <h3 className="text-4xl font-black tracking-tighter uppercase text-neutral-200">Dataset Generator</h3>
                        <div className="flex items-center gap-4 mt-2">
                          <p className="text-[14px] text-neutral-600 font-black uppercase tracking-[0.5em]">Active Target: {projectName}</p>
                          <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${profileMode === 'auto' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-violet-500/20 text-violet-400'}`}>
                            {profileMode === 'auto' ? 'AUTO PROFILE' : 'MANUAL PROFILE'}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-14">
                      <div className="text-right">
                        <p className={`text-xl font-black uppercase tracking-[0.5em] ${profileMode === 'auto' ? 'text-emerald-400' : 'text-violet-400'}`}>{selectedPoseIds.size} SELECTED</p>
                        <p className="text-[12px] text-neutral-700 font-bold uppercase tracking-widest">Frames in queue</p>
                      </div>
                      <button 
                        disabled={task.status === 'generating' || selectedPoseIds.size === 0} 
                        onClick={startDatasetMode} 
                        className={`px-16 py-7 rounded-[2.5rem] text-[15px] font-black uppercase tracking-[0.1em] transition-all shadow-5xl active:scale-95 disabled:opacity-20 text-white ${profileMode === 'auto' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-violet-600 hover:bg-violet-500'}`}
                      >
                        Generate Batch
                      </button>
                    </div>
                  </div>
                  <div className="p-8 grid grid-cols-3 gap-6 bg-black/80 border-b border-white/5">
                    {(['portrait', 'upper', 'full'] as DatasetGroup[]).map(group => (
                      <button key={group} onClick={() => setExpandedGroup(expandedGroup === group ? null : group)} className={`flex items-center justify-between px-12 py-8 rounded-[3rem] text-[14px] font-black uppercase tracking-[0.4em] transition-all border-2 ${expandedGroup === group ? 'bg-neutral-800 border-white/10 text-white shadow-3xl' : 'bg-transparent border-white/5 text-neutral-700 hover:text-neutral-500'}`}>
                        <div className="flex items-center gap-5">{group === 'portrait' ? <User className="w-7 h-7" /> : group === 'upper' ? <Layout className="w-7 h-7" /> : <Maximize2 className="w-7 h-7" />}{groupLabels[group].split(' ')[0]}</div>
                        {expandedGroup === group ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
                      </button>
                    ))}
                  </div>
                  
                  {expandedGroup && (
                    <div className="px-14 py-10 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 overflow-y-auto max-h-[50vh] custom-scrollbar">
                      {POSE_DEFINITIONS.filter(p => p.group === expandedGroup).map(pose => (
                        <div 
                          key={pose.id} 
                          onClick={() => togglePoseSelection(pose.id)}
                          onMouseEnter={() => setHoveredPoseId(pose.id)}
                          onMouseLeave={() => setHoveredPoseId(null)}
                          className={`group relative p-6 rounded-[2rem] border-2 transition-all cursor-pointer ${selectedPoseIds.has(pose.id) ? (profileMode === 'auto' ? 'bg-emerald-500/10 border-emerald-500' : 'bg-violet-500/10 border-violet-500') + ' shadow-xl' : 'bg-black/40 border-white/5 hover:border-white/20'}`}
                        >
                          <div className="flex justify-between items-start mb-4">
                            <div className={`p-2 rounded-lg ${selectedPoseIds.has(pose.id) ? (profileMode === 'auto' ? 'bg-emerald-500 text-black' : 'bg-violet-500 text-white') : 'bg-white/5 text-neutral-600'}`}>
                              {selectedPoseIds.has(pose.id) ? <CheckCircle2 className="w-4 h-4" /> : <Fingerprint className="w-4 h-4" />}
                            </div>
                            <span className="text-[10px] font-black text-neutral-700">{pose.id.toUpperCase()}</span>
                          </div>
                          <p className="text-[11px] font-black text-neutral-300 uppercase tracking-widest leading-relaxed mb-2">{pose.label}</p>
                          <p className="text-[9px] text-neutral-600 leading-tight italic line-clamp-2">{pose.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="p-10 bg-black/40 border-t border-white/5 flex justify-between items-center">
                    <button onClick={selectRecommended702010} className={`text-[11px] font-black uppercase tracking-widest transition-colors ${profileMode === 'auto' ? 'text-emerald-500 hover:text-emerald-400' : 'text-violet-500 hover:text-violet-400'}`}>Select All Protocol</button>
                    <div className="flex gap-4">
                      <button onClick={() => setSelectedPoseIds(new Set())} className="text-[11px] font-black text-neutral-600 uppercase tracking-widest hover:text-neutral-400 transition-colors">Clear Selection</button>
                    </div>
                  </div>
                </div>
              )}

              {gallery.length > 0 && (
                <div className="space-y-12 animate-in fade-in duration-1000">
                  <div className="flex items-center justify-between px-10">
                    <div className="flex items-center gap-6">
                      <div className="p-4 bg-emerald-500/10 rounded-2xl"><Archive className="w-6 h-6 text-emerald-400" /></div>
                      <div>
                        <h3 className="text-2xl font-black tracking-tighter uppercase text-neutral-200">Production Bin</h3>
                        <p className="text-[10px] text-neutral-600 font-bold uppercase tracking-[0.4em]">{gallery.length} Frames Generated</p>
                      </div>
                    </div>
                    <button 
                      onClick={handleClearClick} 
                      className={`flex items-center gap-3 px-8 py-4 rounded-full transition-all text-[11px] font-black uppercase tracking-widest border ${clearConfirmMode ? 'bg-red-600 border-red-400 text-white' : 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20'}`}
                    >
                      <Trash2 className="w-5 h-5" />
                      {clearConfirmMode ? "ARE YOU SURE?" : "Clear Bin"}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-8">
                    {gallery.map((img) => (
                      <div key={img.id} onClick={() => setSelectedImage(img)} className="group relative aspect-square rounded-[2.5rem] overflow-hidden border border-white/5 cursor-pointer shadow-3xl hover:border-emerald-500/50 transition-all">
                        <img src={img.url} alt="Generated" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                        
                        {/* Individual Delete Button */}
                        <button 
                          onClick={(e) => deleteImage(img.id, e)}
                          className="absolute top-6 right-6 p-3 bg-red-600/80 hover:bg-red-600 text-white rounded-xl opacity-0 group-hover:opacity-100 transition-all z-10 shadow-xl active:scale-90 backdrop-blur-sm"
                          title="Remove from Bin"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute bottom-6 left-6 right-6 flex justify-between items-center translate-y-4 group-hover:translate-y-0 transition-transform opacity-0 group-hover:opacity-100">
                          <p className="text-[10px] font-black text-white uppercase tracking-widest">{img.id.split('-').pop()}</p>
                          <div className="p-2 bg-emerald-500 rounded-lg"><Maximize2 className="w-4 h-4 text-black" /></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {failedAssets.length > 0 && (
                <div className="p-12 bg-red-500/5 border border-red-500/20 rounded-[4rem] space-y-8">
                  <div className="flex items-center gap-5 text-red-500">
                    <AlertCircle className="w-7 h-7" />
                    <h3 className="text-xl font-black uppercase tracking-widest">Failed Asset Matrix ({failedAssets.length})</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {failedAssets.map(fail => (
                      <div key={fail.id} className="p-6 bg-black/40 rounded-3xl border border-red-500/10 space-y-4">
                        <div className="flex justify-between items-start">
                          <p className="text-[11px] font-black text-red-400 uppercase tracking-widest">{fail.label}</p>
                          <span className="text-[9px] text-neutral-600 tabular-nums">{new Date(fail.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-[10px] text-neutral-500 leading-relaxed italic line-clamp-2">{fail.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-white/5 py-12 bg-black/40">
        <div className="container mx-auto px-10 flex justify-between items-center">
          <p className="text-[10px] text-neutral-600 font-bold uppercase tracking-[0.4em]">Proprietary Generation Engine &copy; 2024</p>
          <div className="flex gap-10">
            <div className="flex items-center gap-3"><Terminal className="w-4 h-4 text-emerald-500" /><p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">System Stable</p></div>
            <div className="flex items-center gap-3"><History className="w-4 h-4 text-neutral-700" /><p className="text-[10px] font-black text-neutral-700 uppercase tracking-widest">Matrix Rev 10</p></div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
