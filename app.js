(function(){
  "use strict";
  var GYM_STORE_KEY = "gym_zaznamy_v1";
  var gymEditingId = null;

  function showBanner(msg){
    var b = document.getElementById("diagBanner");
    b.textContent = msg;
    b.style.display = "block";
  }
  window.addEventListener("error", function(e){
    showBanner("Chyba ve skriptu: " + (e.message || e) + (e.filename ? " ("+e.filename+":"+e.lineno+")" : ""));
  });

  function toLocalISO(d){
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  }
  function todayISO(){ return toLocalISO(new Date()); }
  function fmtDate(iso){
    if(!iso) return "";
    var p = iso.split("-");
    if(p.length!==3) return iso;
    return p[2] + "." + p[1] + "." + p[0];
  }
  function num(v){
    if(v===null || v===undefined || v==="") return null;
    var n = parseFloat(String(v).replace(",","."));
    return isNaN(n) ? null : n;
  }
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function esc(s){
    var d = document.createElement("div"); d.textContent = s; return d.innerHTML;
  }
  function csvEscape(v){
    v = String(v);
    if(/[",\n]/.test(v)) v = "\""+v.replace(/"/g,"\"\"")+"\"";
    return v;
  }

  // ---------- theme toggle ----------
  var THEME_KEY = "gym_theme_v1";
  var themeToggleBtn = document.getElementById("themeToggleBtn");
  function getSystemTheme(){
    return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  }
  function explicitTheme(){
    try{ return localStorage.getItem(THEME_KEY); }catch(e){ return null; }
  }
  function effectiveTheme(){ return explicitTheme() || getSystemTheme(); }
  function applyTheme(){
    var t = explicitTheme();
    if(t) document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
    var eff = effectiveTheme();
    themeToggleBtn.textContent = eff==="dark" ? "☾ Tmavý" : "☀ Světlý";
  }
  themeToggleBtn.addEventListener("click", function(){
    var next = effectiveTheme()==="dark" ? "light" : "dark";
    try{ localStorage.setItem(THEME_KEY, next); }catch(e){}
    applyTheme();
  });
  applyTheme();

  // ---------- undo toast ----------
  var toastEl = document.getElementById("toast");
  var toastMsgEl = document.getElementById("toastMsg");
  var toastUndoBtn = document.getElementById("toastUndo");
  var toastTimer = null;
  function showUndoToast(msg, undoFn){
    clearTimeout(toastTimer);
    toastMsgEl.textContent = msg;
    toastEl.style.display = "flex";
    var freshBtn = toastUndoBtn.cloneNode(true);
    toastUndoBtn.parentNode.replaceChild(freshBtn, toastUndoBtn);
    toastUndoBtn = freshBtn;
    toastUndoBtn.addEventListener("click", function(){
      clearTimeout(toastTimer);
      toastEl.style.display = "none";
      undoFn();
    });
    toastTimer = setTimeout(function(){ toastEl.style.display = "none"; }, 6000);
  }

  // ---------- data ----------
  function loadGym(){
    try{
      var raw = localStorage.getItem(GYM_STORE_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(e){
      showBanner("Tento prohlížeč blokuje lokální ukládání dat. (" + e.message + ")");
      return [];
    }
  }
  function saveGym(rows){
    try{ localStorage.setItem(GYM_STORE_KEY, JSON.stringify(rows)); }catch(e){
      showBanner("Uložení se nezdařilo — prohlížeč odmítl zápis do localStorage. (" + e.message + ")");
    }
  }
  var gymData = loadGym();

  function sortedGym(){
    return gymData.slice().sort(function(a,b){ return (a.datum||"").localeCompare(b.datum||""); });
  }
  function serieVolume(serie){
    return serie.reduce(function(s,x){ return s + (x.vaha!=null && x.opakovani!=null ? x.vaha*x.opakovani : 0); }, 0);
  }
  function topSerieWeight(serie){
    var weights = serie.map(function(x){return x.vaha;}).filter(function(v){return v!=null;});
    return weights.length ? Math.max.apply(null, weights) : null;
  }
  function fmtSerie(serie){
    return serie.map(function(s){
      if(s.vaha!=null && s.opakovani!=null) return s.vaha+"×"+s.opakovani;
      if(s.vaha!=null) return s.vaha+"kg";
      if(s.opakovani!=null) return s.opakovani+"x";
      return "";
    }).filter(Boolean).join(", ");
  }
  function est1RM(vaha, opakovani){
    if(vaha==null || opakovani==null) return null;
    return vaha * (1 + opakovani/30);
  }

  // ---------- form ----------
  var gymForm = document.getElementById("gymForm");
  var gfDatum = document.getElementById("gf_datum");
  var gfPoznamka = document.getElementById("gf_poznamka");
  var seriesRowsEl = document.getElementById("seriesRows");
  var gymSubmitBtn = document.getElementById("gymSubmitBtn");
  var gymCancelEditBtn = document.getElementById("gymCancelEditBtn");
  var gymFormTitle = document.getElementById("gymFormTitle");
  var gfCvikSelect = document.getElementById("gf_cvik_select");
  var gfCvikCustom = document.getElementById("gf_cvik_custom");
  var CUSTOM_CVIK = "__custom__";

  var EXERCISE_GROUPS = {
    "Prsa": ["Bench press", "Incline bench press", "Decline bench press", "Dumbbell press", "Incline dumbbell press", "Chest fly", "Cable fly", "Push-up"],
    "Záda": ["Deadlift", "Romanian deadlift", "T-bar row", "Barbell row", "Dumbbell row", "Lat pulldown", "Pull-up", "Seated cable row"],
    "Ramena": ["Overhead press", "Shoulder press", "Lateral raise", "Front raise", "Rear delt fly", "Shrugs"],
    "Nohy": ["Squat", "Leg press", "Leg extension", "Leg curl", "Lunges", "Bulgarian split squat", "Calf raise", "Hip thrust"],
    "Ruce": ["Biceps curl", "Hammer curl", "Triceps pushdown", "Triceps extension", "Dips"],
    "Core": ["Plank", "Crunches"]
  };
  var GROUP_ORDER = ["Prsa", "Záda", "Ramena", "Nohy", "Ruce", "Core"];

  function allPresetExercises(){
    var out = [];
    GROUP_ORDER.forEach(function(g){ out = out.concat(EXERCISE_GROUPS[g]); });
    return out;
  }

  function buildCvikOptions(loggedNames){
    var preset = allPresetExercises();
    var extra = (loggedNames||[]).filter(function(n){ return preset.indexOf(n)===-1; }).sort();
    var html = "<option value=\"\" disabled selected>Vyber cvik…</option>";
    GROUP_ORDER.forEach(function(g){
      html += "<optgroup label=\""+esc(g)+"\">";
      EXERCISE_GROUPS[g].forEach(function(n){ html += "<option value=\""+esc(n)+"\">"+esc(n)+"</option>"; });
      html += "</optgroup>";
    });
    if(extra.length){
      html += "<optgroup label=\"Dříve použité\">";
      extra.forEach(function(n){ html += "<option value=\""+esc(n)+"\">"+esc(n)+"</option>"; });
      html += "</optgroup>";
    }
    html += "<option value=\""+CUSTOM_CVIK+"\">➕ Vlastní cvik…</option>";
    return html;
  }

  function toggleCustomCvik(show){
    gfCvikCustom.style.display = show ? "block" : "none";
    gfCvikCustom.required = show;
    if(show) gfCvikCustom.focus();
  }
  gfCvikSelect.addEventListener("change", function(){
    toggleCustomCvik(gfCvikSelect.value === CUSTOM_CVIK);
  });

  function getCvikValue(){
    return gfCvikSelect.value === CUSTOM_CVIK ? gfCvikCustom.value.trim() : gfCvikSelect.value;
  }
  function setCvikValue(name){
    var matched = Array.from(gfCvikSelect.options).some(function(opt){ return opt.value === name; });
    if(name && matched){
      gfCvikSelect.value = name;
      toggleCustomCvik(false);
      gfCvikCustom.value = "";
    } else if(name){
      gfCvikSelect.value = CUSTOM_CVIK;
      toggleCustomCvik(true);
      gfCvikCustom.value = name;
    } else {
      gfCvikSelect.selectedIndex = 0;
      toggleCustomCvik(false);
      gfCvikCustom.value = "";
    }
  }
  gfCvikSelect.innerHTML = buildCvikOptions([]);

  function addSerieRow(vaha, opak){
    var row = document.createElement("div");
    row.className = "serie-row";
    row.innerHTML =
      "<span class=\"serie-num\"></span>"+
      "<input type=\"text\" inputmode=\"decimal\" class=\"serie-vaha\" placeholder=\"váha (kg)\" />"+
      "<input type=\"text\" inputmode=\"decimal\" class=\"serie-opak\" placeholder=\"opakování\" />"+
      "<button type=\"button\" class=\"ghost small serie-remove\">✕</button>";
    row.querySelector(".serie-vaha").value = vaha ?? "";
    row.querySelector(".serie-opak").value = opak ?? "";
    row.querySelector(".serie-remove").addEventListener("click", function(){
      row.remove();
      renumberSerieRows();
    });
    seriesRowsEl.appendChild(row);
    renumberSerieRows();
  }
  function renumberSerieRows(){
    Array.from(seriesRowsEl.children).forEach(function(row,i){
      row.querySelector(".serie-num").textContent = "#"+(i+1);
    });
  }
  document.getElementById("btnAddSerie").addEventListener("click", function(){ addSerieRow(); });

  function resetGymForm(){
    gymEditingId = null;
    gymForm.reset();
    gfDatum.value = todayISO();
    setCvikValue("");
    seriesRowsEl.innerHTML = "";
    addSerieRow();
    gymFormTitle.textContent = "Nový záznam";
    gymSubmitBtn.textContent = "Uložit záznam";
    gymCancelEditBtn.style.display = "none";
  }
  resetGymForm();

  gymForm.addEventListener("submit", function(e){
    e.preventDefault();
    var serie = Array.from(seriesRowsEl.querySelectorAll(".serie-row")).map(function(row){
      return { vaha: num(row.querySelector(".serie-vaha").value), opakovani: num(row.querySelector(".serie-opak").value) };
    }).filter(function(s){ return s.vaha!=null || s.opakovani!=null; });

    var cvikName = getCvikValue();
    if(!cvikName){ gfCvikCustom.focus(); return; }

    var rec = {
      id: gymEditingId || uid(),
      datum: gfDatum.value || todayISO(),
      cvik: cvikName,
      serie: serie,
      poznamka: gfPoznamka.value.trim()
    };
    if(gymEditingId){
      var idx = gymData.findIndex(function(r){return r.id===gymEditingId;});
      if(idx>-1) gymData[idx]=rec;
    } else {
      gymData.push(rec);
    }
    saveGym(gymData);
    resetGymForm();
    renderGym();
    window.scrollTo({top:0, behavior:"smooth"});
  });

  gymCancelEditBtn.addEventListener("click", resetGymForm);

  function startGymEdit(id){
    var rec = gymData.find(function(r){return r.id===id;});
    if(!rec) return;
    gymEditingId = id;
    gfDatum.value = rec.datum || todayISO();
    setCvikValue(rec.cvik || "");
    gfPoznamka.value = rec.poznamka || "";
    seriesRowsEl.innerHTML = "";
    (rec.serie && rec.serie.length ? rec.serie : [{vaha:null,opakovani:null}]).forEach(function(s){ addSerieRow(s.vaha, s.opakovani); });
    gymFormTitle.textContent = "Upravit záznam";
    gymSubmitBtn.textContent = "Uložit změny";
    gymCancelEditBtn.style.display = "inline-block";
    window.scrollTo({top:0, behavior:"smooth"});
  }

  function deleteGymRow(id){
    var removed = gymData.find(function(r){return r.id===id;});
    if(!removed) return;
    gymData = gymData.filter(function(r){return r.id!==id;});
    saveGym(gymData);
    renderGym();
    showUndoToast("Záznam smazán.", function(){
      gymData.push(removed);
      saveGym(gymData);
      renderGym();
    });
  }

  // ---------- table ----------
  var gymTbody = document.getElementById("gymTbody");
  var gymEmptyMsg = document.getElementById("gymEmptyMsg");
  var gymRowCount = document.getElementById("gymRowCount");
  var gymSelectedIds = new Set();
  var gymSelectAllChk = document.getElementById("gymSelectAllChk");
  var gymBtnDeleteSelected = document.getElementById("gymBtnDeleteSelected");
  var gymSelCountEl = document.getElementById("gymSelCount");

  function updateGymBulkToolbar(){
    gymSelCountEl.textContent = gymSelectedIds.size;
    gymBtnDeleteSelected.style.display = gymSelectedIds.size ? "inline-block" : "none";
  }

  function renderGym(){
    var sorted = sortedGym();
    var idsOnScreen = {};
    sorted.forEach(function(r){ idsOnScreen[r.id]=true; });
    gymSelectedIds.forEach(function(id){ if(!idsOnScreen[id]) gymSelectedIds.delete(id); });

    gymRowCount.textContent = sorted.length ? "(" + sorted.length + ")" : "";
    gymTbody.innerHTML = "";
    gymEmptyMsg.style.display = sorted.length ? "none" : "block";
    sorted.slice().reverse().forEach(function(r){
      var tr = document.createElement("tr");
      var vol = serieVolume(r.serie || []);
      tr.innerHTML =
        "<td><input type=\"checkbox\" class=\"gymRowChk\" "+(gymSelectedIds.has(r.id)?"checked":"")+"/></td>"+
        "<td>"+fmtDate(r.datum)+"</td>"+
        "<td>"+esc(r.cvik||"")+"</td>"+
        "<td>"+esc(fmtSerie(r.serie||[]))+"</td>"+
        "<td>"+(vol ? Math.round(vol).toLocaleString("cs-CZ")+" kg" : "")+"</td>"+
        "<td class=\"actions-cell\"></td>";
      tr.querySelector(".gymRowChk").addEventListener("change", function(e){
        if(e.target.checked) gymSelectedIds.add(r.id); else gymSelectedIds.delete(r.id);
        gymSelectAllChk.checked = sorted.length>0 && sorted.every(function(x){return gymSelectedIds.has(x.id);});
        updateGymBulkToolbar();
      });
      var actionsTd = tr.querySelector(".actions-cell");
      var editBtn = document.createElement("button");
      editBtn.className="ghost small"; editBtn.textContent="Upravit";
      editBtn.addEventListener("click", function(){ startGymEdit(r.id); });
      var delBtn = document.createElement("button");
      delBtn.className="ghost small"; delBtn.textContent="Smazat"; delBtn.style.marginLeft="4px"; delBtn.style.color="var(--danger)";
      delBtn.addEventListener("click", function(){ deleteGymRow(r.id); });
      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(delBtn);
      gymTbody.appendChild(tr);
    });
    gymSelectAllChk.checked = sorted.length>0 && sorted.every(function(x){return gymSelectedIds.has(x.id);});
    updateGymBulkToolbar();

    updateExerciseDatalist(sorted);
    renderGymWeekly(sorted);
    renderPRs(sorted);
    renderGymChart(sorted);
  }

  gymSelectAllChk.addEventListener("change", function(){
    var sorted = sortedGym();
    if(gymSelectAllChk.checked) sorted.forEach(function(r){ gymSelectedIds.add(r.id); });
    else gymSelectedIds.clear();
    renderGym();
  });

  gymBtnDeleteSelected.addEventListener("click", function(){
    if(!gymSelectedIds.size) return;
    var removed = gymData.filter(function(r){ return gymSelectedIds.has(r.id); });
    var count = removed.length;
    gymData = gymData.filter(function(r){ return !gymSelectedIds.has(r.id); });
    gymSelectedIds.clear();
    saveGym(gymData);
    renderGym();
    showUndoToast("Smazáno "+count+" záznamů.", function(){
      gymData = gymData.concat(removed);
      saveGym(gymData);
      renderGym();
    });
  });

  function updateExerciseDatalist(sorted){
    var loggedNames = Array.from(new Set(sorted.map(function(r){return r.cvik;}).filter(Boolean)));

    var currentCvik = getCvikValue();
    gfCvikSelect.innerHTML = buildCvikOptions(loggedNames);
    setCvikValue(currentCvik);

    var exSelect = document.getElementById("gymChartExercise");
    var prevSelected = exSelect.value;
    var chartNames = loggedNames.sort();
    exSelect.innerHTML = chartNames.map(function(n){ return "<option value=\""+esc(n)+"\">"+esc(n)+"</option>"; }).join("");
    if(chartNames.length){
      exSelect.value = chartNames.indexOf(prevSelected)>-1 ? prevSelected : chartNames[chartNames.length-1];
    }
  }

  // ---------- weekly training summary ----------
  function weekKeyAndLabel(datum){
    var d = new Date(datum+"T00:00:00");
    var day = (d.getDay()+6)%7;
    d.setDate(d.getDate()-day);
    var end = new Date(d); end.setDate(end.getDate()+6);
    var key = toLocalISO(d);
    var label = fmtDate(key).slice(0,5) + "–" + fmtDate(toLocalISO(end));
    return {key:key, label:label};
  }

  function renderGymWeekly(sorted){
    var body = document.getElementById("gymWeeklyBody");
    var emptyEl = document.getElementById("gymWeeklyEmpty");
    var withDate = sorted.filter(function(r){return r.datum;});
    if(!withDate.length){ body.innerHTML=""; emptyEl.style.display="block"; return; }

    var groups = {};
    var order = [];
    withDate.forEach(function(r){
      var kl = weekKeyAndLabel(r.datum);
      if(!groups[kl.key]){ groups[kl.key] = {label:kl.label, days:{}, entries:0, volume:0}; order.push(kl.key); }
      var g = groups[kl.key];
      g.days[r.datum] = true;
      g.entries++;
      g.volume += serieVolume(r.serie||[]);
    });
    order.sort().reverse();

    emptyEl.style.display = "none";
    body.innerHTML = order.map(function(key){
      var g = groups[key];
      return "<tr><td>"+g.label+"</td>"+
        "<td>"+Object.keys(g.days).length+"</td>"+
        "<td>"+g.entries+"</td>"+
        "<td>"+(g.volume ? Math.round(g.volume).toLocaleString("cs-CZ")+" kg" : "–")+"</td></tr>";
    }).join("");
  }

  // ---------- export ----------
  document.getElementById("gymBtnExport").addEventListener("click", function(){
    var header = ["Datum","Cvik","Serie","Objem_kg","Poznamka"];
    var lines = [header.join(",")];
    sortedGym().forEach(function(r){
      var row = [r.datum||"", r.cvik||"", fmtSerie(r.serie||[]), Math.round(serieVolume(r.serie||[])), r.poznamka||""];
      lines.push(row.map(csvEscape).join(","));
    });
    var blob = new Blob([lines.join("\r\n")], {type:"text/csv;charset=utf-8;"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "gym_export_"+todayISO()+".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  function downloadBackupFile(content, filename){
    var blob = new Blob([content], {type:"application/json;charset=utf-8;"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  document.getElementById("gymBtnShare").addEventListener("click", function(){
    var filename = "gym_zaloha_" + todayISO() + ".json";
    var json = JSON.stringify({ gym: gymData, exportedAt: new Date().toISOString() }, null, 2);

    var file;
    try{ file = new File([json], filename, {type:"application/json"}); }catch(e){ file = null; }

    if(file && navigator.canShare && navigator.canShare({files:[file]})){
      navigator.share({
        files: [file],
        title: "Gym Progress záloha",
        text: "Záloha záznamů cvičení (" + todayISO() + ")"
      }).catch(function(e){
        if(e && e.name !== "AbortError") downloadBackupFile(json, filename);
      });
    } else {
      downloadBackupFile(json, filename);
    }
  });

  // ---------- personal records ----------
  // ---------- body profile (for strength-level estimate) ----------
  var BODY_KEY = "gym_telo_v1";
  var bpPohlavi = document.getElementById("bp_pohlavi");
  var bpVaha = document.getElementById("bp_vaha");

  function loadBody(){
    try{
      var raw = localStorage.getItem(BODY_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }
  function saveBody(b){
    try{ localStorage.setItem(BODY_KEY, JSON.stringify(b)); }catch(e){}
  }
  var bodyProfile = loadBody();
  if(bodyProfile){
    bpPohlavi.value = bodyProfile.pohlavi || "muz";
    bpVaha.value = bodyProfile.vaha ?? "";
  }
  document.getElementById("btnSaveBody").addEventListener("click", function(){
    bodyProfile = { pohlavi: bpPohlavi.value, vaha: num(bpVaha.value) };
    saveBody(bodyProfile);
    renderGym();
  });

  // Bodyweight-multiplier benchmarks (Decent / Good / Great) by Tim Henriques,
  // via Legion Athletics - an approximate reference, not a real population percentile.
  var STRENGTH_STANDARDS = {
    muz: {
      "squat": [1.25, 1.75, 2.5],
      "bench press": [0.75, 1.0, 1.5],
      "deadlift": [1.75, 2.25, 3.25],
      "overhead press": [0.5, 0.75, 1.0]
    },
    zena: {
      "squat": [0.75, 1.25, 1.75],
      "bench press": [0.4, 0.6, 0.9],
      "deadlift": [1.0, 1.5, 2.1],
      "overhead press": [0.3, 0.5, 0.75]
    }
  };

  function strengthLevelPercent(ratio, thresholds){
    var pts = [0, thresholds[0], thresholds[1], thresholds[2]];
    var pct = [0, 33, 66, 100];
    if(ratio<=0) return 0;
    for(var i=0;i<pts.length-1;i++){
      if(ratio <= pts[i+1]){
        var frac = (ratio-pts[i]) / (pts[i+1]-pts[i]);
        return pct[i] + frac*(pct[i+1]-pct[i]);
      }
    }
    var slope = (pct[3]-pct[2]) / (pts[3]-pts[2]);
    return pct[3] + (ratio-pts[3])*slope;
  }

  function strengthEstimate(cvik, rm){
    if(!bodyProfile || !bodyProfile.vaha || !cvik) return null;
    var key = cvik.trim().toLowerCase();
    var table = STRENGTH_STANDARDS[bodyProfile.pohlavi || "muz"];
    if(!table || !table[key]) return null;
    var ratio = rm / bodyProfile.vaha;
    var pct = strengthLevelPercent(ratio, table[key]);
    var tier = pct>=100 ? "great" : (pct>=66 ? "good" : (pct>=33 ? "decent" : "low"));
    var tierLabel = pct>=100 ? "nad Great" : (pct>=66 ? "Good→Great" : (pct>=33 ? "Decent→Good" : "pod Decent"));
    return { pct: pct, tier: tier, label: tierLabel };
  }

  function renderPRs(sorted){
    var prBody = document.getElementById("prTbody");
    var prEmpty = document.getElementById("prEmptyMsg");
    var byExercise = {};
    sorted.forEach(function(r){
      if(!r.cvik) return;
      (r.serie||[]).forEach(function(s){
        if(s.vaha==null) return;
        var rm = est1RM(s.vaha, s.opakovani==null?1:s.opakovani);
        if(!byExercise[r.cvik] || rm > byExercise[r.cvik].rm){
          byExercise[r.cvik] = {rm:rm, vaha:s.vaha, opakovani:s.opakovani, datum:r.datum};
        }
      });
    });
    var names = Object.keys(byExercise).sort();
    prEmpty.style.display = names.length ? "none" : "block";
    prBody.innerHTML = names.map(function(n){
      var pr = byExercise[n];
      var est = strengthEstimate(n, pr.rm);
      var estCell = est ? "<span class=\"strength-badge tier-"+est.tier+"\">"+Math.round(est.pct)+" %</span> <span class=\"hint\">("+est.label+")</span>" : "<span class=\"hint\">–</span>";
      return "<tr><td>"+esc(n)+"</td>"+
        "<td>"+pr.vaha+"kg"+(pr.opakovani!=null ? " × "+pr.opakovani : "")+"</td>"+
        "<td>"+Math.round(pr.rm)+" kg</td>"+
        "<td>"+fmtDate(pr.datum)+"</td>"+
        "<td>"+estCell+"</td></tr>";
    }).join("");
  }

  // ---------- progress chart ----------
  var gymChartMetric = "top";
  document.querySelectorAll(".gym-metric-btn").forEach(function(btn){
    btn.addEventListener("click", function(){
      gymChartMetric = btn.getAttribute("data-gym-metric");
      document.querySelectorAll(".gym-metric-btn").forEach(function(b){ b.classList.toggle("active", b===btn); });
      renderGymChart(sortedGym());
    });
  });
  document.getElementById("gymChartExercise").addEventListener("change", function(){
    renderGymChart(sortedGym());
  });

  function renderGymChart(sorted){
    var wrap = document.getElementById("gymChartWrap");
    var exercise = document.getElementById("gymChartExercise").value;
    if(!exercise){
      wrap.innerHTML = "<div class=\"empty\">Zatím žádná data — zadej první záznam nahoře.</div>";
      return;
    }
    var byDate = {};
    sorted.filter(function(r){ return r.cvik===exercise; }).forEach(function(r){
      var top = topSerieWeight(r.serie||[]);
      var vol = serieVolume(r.serie||[]);
      if(!byDate[r.datum]) byDate[r.datum] = {top:null, vol:0};
      if(top!=null) byDate[r.datum].top = byDate[r.datum].top==null ? top : Math.max(byDate[r.datum].top, top);
      byDate[r.datum].vol += vol;
    });
    var dates = Object.keys(byDate).sort();
    var pts = dates.map(function(d){
      return { datum:d, value: gymChartMetric==="top" ? byDate[d].top : byDate[d].vol };
    }).filter(function(p){ return p.value!=null; });

    if(pts.length < 2){
      wrap.innerHTML = "<div class=\"empty\">Přidej alespoň dva záznamy tohoto cviku pro zobrazení grafu.</div>";
      return;
    }

    var unit = gymChartMetric==="top" ? "kg" : "kg (objem)";
    var W = Math.max(320, pts.length*40), H = 190, padL=44, padR=14, padT=14, padB=26;
    var vals = pts.map(function(p){return p.value;});
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if(min===max){ min-=1; max+=1; }
    var range = max-min;
    min -= range*0.1; max += range*0.1; range = max-min;

    function x(i){ return padL + (pts.length===1?0:(i*(W-padL-padR)/(pts.length-1))); }
    function y(v){ return padT + (H-padT-padB) * (1-(v-min)/range); }

    var linePath = pts.map(function(p,i){ return (i===0?"M":"L")+x(i).toFixed(1)+","+y(p.value).toFixed(1); }).join(" ");
    var areaPath = linePath + " L"+x(pts.length-1).toFixed(1)+","+(H-padB)+" L"+x(0).toFixed(1)+","+(H-padB)+" Z";

    var gridLines = "";
    var steps = 4;
    for(var g=0; g<=steps; g++){
      var gv = min + range*g/steps;
      var gy = y(gv);
      gridLines += "<line x1=\""+padL+"\" x2=\""+(W-padR)+"\" y1=\""+gy.toFixed(1)+"\" y2=\""+gy.toFixed(1)+"\" class=\"gridline\"/>";
      gridLines += "<text x=\""+(padL-8)+"\" y=\""+(gy+4).toFixed(1)+"\" text-anchor=\"end\" class=\"axislabel\">"+Math.round(gv)+"</text>";
    }
    var dots = pts.map(function(p,i){
      return "<circle class=\"gympt\" data-idx=\""+i+"\" cx=\""+x(i).toFixed(1)+"\" cy=\""+y(p.value).toFixed(1)+"\" r=\"4\" fill=\"var(--accent)\" stroke=\"var(--surface)\" stroke-width=\"1.5\"/>";
    }).join("");
    var everyN = Math.ceil(pts.length / 8) || 1;
    var xlabels = pts.map(function(p,i){
      if(i % everyN !== 0 && i !== pts.length-1) return "";
      return "<text x=\""+x(i).toFixed(1)+"\" y=\""+(H-6)+"\" text-anchor=\"middle\" class=\"axislabel\">"+fmtDate(p.datum).slice(0,5)+"</text>";
    }).join("");

    wrap.innerHTML =
      "<div class=\"chart-inner\" style=\"position:relative;\">"+
      "<svg class=\"chart\" width=\""+W+"\" height=\""+H+"\" viewBox=\"0 0 "+W+" "+H+"\">"+
      "<style>.gridline{stroke:var(--border);stroke-width:1;} .axislabel{font-size:10px; fill:var(--muted);} .gympt{cursor:pointer;} .gympt:active{r:6;}</style>"+
      "<path d=\""+areaPath+"\" fill=\"var(--accent-soft)\" opacity=\"0.6\" stroke=\"none\"/>"+
      gridLines +
      "<path d=\""+linePath+"\" fill=\"none\" stroke=\"var(--accent)\" stroke-width=\"2\"/>"+
      dots + xlabels +
      "</svg>"+
      "<div class=\"chart-tooltip\" id=\"gymChartTooltip\" style=\"display:none;\"></div>"+
      "</div>";

    var tooltip = document.getElementById("gymChartTooltip");
    wrap.querySelectorAll(".gympt").forEach(function(circle){
      function show(){
        var p = pts[+circle.getAttribute("data-idx")];
        tooltip.innerHTML = "<div class=\"v\">"+Math.round(p.value).toLocaleString("cs-CZ")+" "+unit+"</div><div class=\"d\">"+fmtDate(p.datum)+"</div>";
        tooltip.style.display = "block";
        var cx = parseFloat(circle.getAttribute("cx"));
        var cy = parseFloat(circle.getAttribute("cy"));
        tooltip.style.left = cx + "px";
        tooltip.style.top = cy + "px";
      }
      circle.addEventListener("mouseenter", show);
      circle.addEventListener("touchstart", function(e){ show(); }, {passive:true});
      circle.addEventListener("mouseleave", function(){ tooltip.style.display = "none"; });
    });
  }

  renderGym();
})();
