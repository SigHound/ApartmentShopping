import React, { useState, useEffect, useRef } from 'react';
import { 
  Home, 
  MapPin, 
  Settings as SettingsIcon, 
  Sliders, 
  Plus, 
  Trash2, 
  Edit2,
  ExternalLink, 
  FileText, 
  DollarSign, 
  Star, 
  Map as MapIcon, 
  Briefcase, 
  ShoppingBag, 
  Calendar,
  Layers,
  Sparkles,
  Clipboard,
  ZoomIn,
  Search,
  Check,
  X,
  Compass,
  ChevronsUpDown,
  Navigation,
  LayoutGrid,
  List,
  Bed,
  Upload,
  Download
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ChartTooltip, 
  Legend, 
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Constants
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5252';

// Leaflet Icon Setup
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Leaflet Icons for Apartment (Purple) and POI (Cyan)
const apartmentMarkerIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const createPoiDivIcon = (emoji) => {
  return L.divIcon({
    html: `<div class="flex items-center justify-center bg-slate-900 border-2 border-cyan-400 text-base rounded-full shadow-lg" style="width: 28px; height: 28px; line-height: 1;">${emoji || '📍'}</div>`,
    className: 'poi-custom-marker-wrapper',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14]
  });
};

// Map controller to reset center dynamically
function ChangeMapView({ center, zoom }) {
  const map = useMap();
  map.setView(center, zoom);
  return null;
}

const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 3958.8; // Radius of the Earth in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const clientGeocode = async (address) => {
  if (!address) return { lat: 30.2672, lon: -97.7431 };
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
  } catch (err) {
    console.error('Client geocoding error:', err);
  }
  return { lat: 30.2672, lon: -97.7431 }; // Default Austin, TX coords
};

export default function App() {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, listings, criteria, settings

  // Global State
  const [apartments, setApartments] = useState([]);
  const [pois, setPois] = useState([]);
  const [criteria, setCriteria] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [priceRange, setPriceRange] = useState({ min: 0, max: 10000 });
  const [selectedCriteriaFilter, setSelectedCriteriaFilter] = useState({});
  const [sortBy, setSortBy] = useState('combined_score'); // combined_score, my_score, partner_score, rent, google_review
  const [minRating, setMinRating] = useState(0);
  const [minBeds, setMinBeds] = useState('');
  const [minBaths, setMinBaths] = useState('');
  const [isStandalone, setIsStandalone] = useState(false);

  // Modal Control
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingApartment, setEditingApartment] = useState(null);

  // Hover Zoom Magnifier State
  const [hoveredFloorplan, setHoveredFloorplan] = useState(null); // { url, x, y }

  // Fetch all data
  const fetchData = async () => {
    setLoading(true);
    
    // Probe backend connection
    let online = false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${API_URL}/api/settings`, { signal: controller.signal });
      clearTimeout(timeoutId);
      online = res.ok;
    } catch (e) {
      online = false;
    }

    if (online) {
      setIsStandalone(false);
      try {
        const [aptRes, poiRes, critRes, setRes] = await Promise.all([
          fetch(`${API_URL}/api/apartments`).then(r => r.json()),
          fetch(`${API_URL}/api/pois`).then(r => r.json()),
          fetch(`${API_URL}/api/criteria`).then(r => r.json()),
          fetch(`${API_URL}/api/settings`).then(r => r.json())
        ]);
        setApartments(aptRes);
        setPois(poiRes);
        setCriteria(critRes);
        setSettings(setRes);
        
        // Cache in localStorage as a backup
        localStorage.setItem('vibenest_apartments', JSON.stringify(aptRes));
        localStorage.setItem('vibenest_pois', JSON.stringify(poiRes));
        localStorage.setItem('vibenest_criteria', JSON.stringify(critRes));
        localStorage.setItem('vibenest_settings', JSON.stringify(setRes));
      } catch (error) {
        console.error('Error fetching data from API:', error);
      } finally {
        setLoading(false);
      }
    } else {
      setIsStandalone(true);
      console.log('Running in Standalone Offline Mode (using browser localStorage)');
      
      // Load from localStorage
      const localApts = JSON.parse(localStorage.getItem('vibenest_apartments')) || [];
      const localPois = JSON.parse(localStorage.getItem('vibenest_pois')) || [];
      const localCriteria = JSON.parse(localStorage.getItem('vibenest_criteria')) || [];
      const localSettings = JSON.parse(localStorage.getItem('vibenest_settings')) || {};

      setApartments(localApts);
      setPois(localPois);
      setCriteria(localCriteria);
      setSettings(localSettings);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Recalculate scores client-side whenever apartments or criteria weights change
  const getNormalizedScores = (apt) => {
    // If the apartment has no attributes associated at all, return null
    const activeAptCriteria = apt.criteria?.filter(ac => ac.value === 1) || [];
    if (activeAptCriteria.length === 0 || criteria.length === 0) {
      return {
        userScore: null,
        partnerScore: null,
        combinedScore: null
      };
    }

    // 1. Separate criteria by type (pro/con)
    const pros = criteria.filter(c => c.type === 'pro');
    const cons = criteria.filter(c => c.type === 'con');

    let maxUser = 0;
    let minUser = 0; // Negative limit
    let maxPartner = 0;
    let minPartner = 0; // Negative limit

    pros.forEach(c => {
      const uw = Math.abs(c.user_weight || 0);
      const pw = Math.abs(c.partner_weight || 0);
      maxUser += uw;
      maxPartner += pw;
    });

    cons.forEach(c => {
      const uw = Math.abs(c.user_weight || 0);
      const pw = Math.abs(c.partner_weight || 0);
      minUser -= uw; // Subtracting con weight to find min possible raw score
      minPartner -= pw; // Subtracting con weight to find min possible raw score
    });

    // Calculate actual raw scores for this apartment
    let rawUser = 0;
    let rawPartner = 0;

    apt.criteria?.forEach(ac => {
      if (ac.value === 1) {
        const critObj = criteria.find(c => c.id === ac.criteria_id);
        if (critObj) {
          const uw = Math.abs(critObj.user_weight || 0);
          const pw = Math.abs(critObj.partner_weight || 0);
          
          if (critObj.type === 'pro') {
            rawUser += uw;
            rawPartner += pw;
          } else {
            rawUser -= uw; // Subtract con weight
            rawPartner -= pw; // Subtract con weight
          }
        }
      }
    });

    // Normalize user score
    let userScore = 50; // Default if no range
    if (maxUser - minUser > 0) {
      userScore = Math.round(((rawUser - minUser) / (maxUser - minUser)) * 100);
    }

    // Normalize partner score
    let partnerScore = 50;
    if (maxPartner - minPartner > 0) {
      partnerScore = Math.round(((rawPartner - minPartner) / (maxPartner - minPartner)) * 100);
    }

    // Combined score (Average of both, or just user score if single)
    const combinedScore = settings.SHOPPING_MODE === 'single' 
      ? userScore 
      : Math.round((userScore + partnerScore) / 2);

    return {
      userScore: Math.max(0, Math.min(100, userScore)),
      partnerScore: Math.max(0, Math.min(100, partnerScore)),
      combinedScore: Math.max(0, Math.min(100, combinedScore))
    };
  };

  // Enhance apartments with calculated scores
  const scoredApartments = apartments.map(apt => {
    const scores = getNormalizedScores(apt);
    return {
      ...apt,
      ...scores
    };
  });

  // Filter & Sort apartments
  const filteredApartments = scoredApartments
    .filter(apt => {
      const matchesSearch = 
        apt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (apt.address && apt.address.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesRent = 
        (!priceRange.min || apt.rent >= priceRange.min) &&
        (!priceRange.max || apt.rent <= priceRange.max);
      
      // Filter by checked criteria constraints (apartment must satisfy ALL checked criteria)
      const matchesCriteria = Object.keys(selectedCriteriaFilter).every(critId => {
        if (!selectedCriteriaFilter[critId]) return true;
        const aptCrit = apt.criteria?.find(ac => ac.criteria_id === parseInt(critId));
        return aptCrit && aptCrit.value === 1;
      });

      // Filter by rating score min
      const matchesRating = !minRating || (apt.google_review_score !== null && apt.google_review_score >= minRating);

      // Filter by number of beds
      const matchesBeds = !minBeds || (apt.bedrooms !== null && apt.bedrooms >= parseInt(minBeds));

      // Filter by number of baths
      const matchesBaths = !minBaths || (apt.bathrooms !== null && apt.bathrooms >= parseFloat(minBaths));

      return matchesSearch && matchesRent && matchesCriteria && matchesRating && matchesBeds && matchesBaths;
    })
    .sort((a, b) => {
      if (sortBy === 'combined_score') {
        const valA = a.combinedScore !== null ? a.combinedScore : -1;
        const valB = b.combinedScore !== null ? b.combinedScore : -1;
        return valB - valA;
      }
      if (sortBy === 'my_score') {
        const valA = a.userScore !== null ? a.userScore : -1;
        const valB = b.userScore !== null ? b.userScore : -1;
        return valB - valA;
      }
      if (sortBy === 'partner_score') {
        const valA = a.partnerScore !== null ? a.partnerScore : -1;
        const valB = b.partnerScore !== null ? b.partnerScore : -1;
        return valB - valA;
      }
      if (sortBy === 'rent') return (a.rent || 99999) - (b.rent || 99999);
      if (sortBy === 'google_review') return (b.google_review_score || 0) - (a.google_review_score || 0);
      return 0;
    });

  // Handle Criteria Weight Updates
  const handleWeightChange = async (criteriaId, who, val) => {
    const critObj = criteria.find(c => c.id === criteriaId);
    if (!critObj) return;

    const user_weight = who === 'user' ? val : critObj.user_weight;
    const partner_weight = who === 'partner' ? val : critObj.partner_weight;

    const updatedCriteria = criteria.map(c => 
      c.id === criteriaId 
        ? { ...c, user_weight, partner_weight }
        : c
    );
    setCriteria(updatedCriteria);

    if (isStandalone) {
      localStorage.setItem('vibenest_criteria', JSON.stringify(updatedCriteria));
    } else {
      try {
        await fetch(`${API_URL}/api/criteria/${criteriaId}/weights`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_weight, partner_weight })
        });
      } catch (err) {
        console.error('Error updating weights:', err);
      }
    }
  };

  // Add new Custom Criteria
  const handleAddCriteria = async (name, type, user_weight, partner_weight) => {
    const uw = user_weight !== undefined ? Math.abs(user_weight) : 3;
    const pw = partner_weight !== undefined ? Math.abs(partner_weight) : 3;

    if (isStandalone) {
      const newCrit = {
        id: Date.now(),
        name,
        type,
        user_weight: uw,
        partner_weight: pw
      };
      const updatedCriteria = [...criteria, newCrit];
      setCriteria(updatedCriteria);
      localStorage.setItem('vibenest_criteria', JSON.stringify(updatedCriteria));
      
      // Update existing apartments to include this criterion as false (0)
      const updatedApts = apartments.map(apt => {
        const existingCrit = apt.criteria || [];
        return {
          ...apt,
          criteria: [...existingCrit, { criteria_id: newCrit.id, value: 0, name, type, user_weight: uw, partner_weight: pw }]
        };
      });
      setApartments(updatedApts);
      localStorage.setItem('vibenest_apartments', JSON.stringify(updatedApts));

      return newCrit;
    } else {
      try {
        const res = await fetch(`${API_URL}/api/criteria`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, type, user_weight: uw, partner_weight: pw })
        });
        const newCrit = await res.json();
        setCriteria(prev => [...prev, newCrit]);
        fetch(`${API_URL}/api/apartments`).then(r => r.json()).then(setApartments);
        return newCrit;
      } catch (err) {
        console.error('Error adding criteria:', err);
      }
    }
    return null;
  };

  // Delete Criteria
  const handleDeleteCriteria = async (id) => {
    if (!confirm('Are you sure you want to delete this criterion? It will be removed from all listings.')) return;
    const updatedCriteria = criteria.filter(c => c.id !== id);
    setCriteria(updatedCriteria);

    if (isStandalone) {
      localStorage.setItem('vibenest_criteria', JSON.stringify(updatedCriteria));
      const updatedApts = apartments.map(apt => ({
        ...apt,
        criteria: (apt.criteria || []).filter(ac => ac.criteria_id !== id)
      }));
      setApartments(updatedApts);
      localStorage.setItem('vibenest_apartments', JSON.stringify(updatedApts));
    } else {
      try {
        await fetch(`${API_URL}/api/criteria/${id}`, { method: 'DELETE' });
        fetch(`${API_URL}/api/apartments`).then(r => r.json()).then(setApartments);
      } catch (err) {
        console.error('Error deleting criteria:', err);
      }
    }
  };

  // Settings Save Setting Key-Value
  const handleSaveSetting = async (key, val) => {
    if (isStandalone) {
      const updatedSettings = { ...settings, [key]: val };
      setSettings(updatedSettings);
      localStorage.setItem('vibenest_settings', JSON.stringify(updatedSettings));
      if (key === 'GOOGLE_MAPS_API_KEY') {
        alert('Google Maps API key saved in browser settings!');
      }
    } else {
      try {
        await fetch(`${API_URL}/api/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value: val })
        });
        setSettings(prev => ({ ...prev, [key]: val }));
        if (key === 'GOOGLE_MAPS_API_KEY') {
          alert('Google Maps API key saved successfully!');
        }
      } catch (err) {
        console.error(`Error saving setting ${key}:`, err);
      }
    }
  };

  const handleSaveApiKey = (key) => handleSaveSetting('GOOGLE_MAPS_API_KEY', key);

  // Add Point of Interest (POI)
  const handleAddPoi = async (name, address, icon) => {
    const finalIcon = icon || '📍';
    if (isStandalone) {
      const newPoi = {
        id: Date.now(),
        name,
        address,
        icon: finalIcon
      };
      
      const coords = await clientGeocode(address);
      newPoi.latitude = coords.lat;
      newPoi.longitude = coords.lon;
      
      const updatedPois = [...pois, newPoi];
      setPois(updatedPois);
      localStorage.setItem('vibenest_pois', JSON.stringify(updatedPois));

      // Calculate commutes to this POI for all apartments client-side
      const updatedApts = await Promise.all(apartments.map(async (apt) => {
        const dist = calculateHaversineDistance(apt.latitude, apt.longitude, newPoi.latitude, newPoi.longitude);
        const normal_time = Math.round(dist * 2.5);
        const rush_hour_time = Math.round(dist * 3.5);
        
        const existingDistances = apt.distances || [];
        return {
          ...apt,
          distances: [
            ...existingDistances,
            { poi_id: newPoi.id, poi_name: name, poi_address: address, normal_time_mins: normal_time, rush_hour_time_mins: rush_hour_time, distance_miles: parseFloat(dist.toFixed(2)) }
          ]
        };
      }));
      setApartments(updatedApts);
      localStorage.setItem('vibenest_apartments', JSON.stringify(updatedApts));
    } else {
      try {
        const coords = await clientGeocode(address);
        const res = await fetch(`${API_URL}/api/pois`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, address, icon: finalIcon, latitude: coords.lat, longitude: coords.lon })
        });
        const newPoi = await res.json();
        setPois(prev => [...prev, newPoi]);
        fetch(`${API_URL}/api/apartments`).then(r => r.json()).then(setApartments);
      } catch (err) {
        console.error('Error adding POI:', err);
      }
    }
  };

  // Delete POI
  const handleDeletePoi = async (id) => {
    if (!confirm('Are you sure you want to delete this location? Commutes to this location will be removed.')) return;
    const updatedPois = pois.filter(p => p.id !== id);
    setPois(updatedPois);

    if (isStandalone) {
      localStorage.setItem('vibenest_pois', JSON.stringify(updatedPois));
      const updatedApts = apartments.map(apt => ({
        ...apt,
        distances: (apt.distances || []).filter(d => d.poi_id !== id)
      }));
      setApartments(updatedApts);
      localStorage.setItem('vibenest_apartments', JSON.stringify(updatedApts));
    } else {
      try {
        await fetch(`${API_URL}/api/pois/${id}`, { method: 'DELETE' });
        fetch(`${API_URL}/api/apartments`).then(r => r.json()).then(setApartments);
      } catch (err) {
        console.error('Error deleting POI:', err);
      }
    }
  };

  // Update POI
  const handleUpdatePoi = async (id, name, address, icon) => {
    const finalIcon = icon || '📍';
    if (isStandalone) {
      const coords = await clientGeocode(address);
      const updatedPois = pois.map(p => p.id === id ? { ...p, name, address, icon: finalIcon, latitude: coords.lat, longitude: coords.lon } : p);
      setPois(updatedPois);
      localStorage.setItem('vibenest_pois', JSON.stringify(updatedPois));

      // Re-calculate commutes to this POI for all apartments client-side
      const updatedApts = await Promise.all(apartments.map(async (apt) => {
        const dist = calculateHaversineDistance(apt.latitude, apt.longitude, coords.lat, coords.lon);
        const normal_time = Math.round(dist * 2.5);
        const rush_hour_time = Math.round(dist * 3.5);
        
        const otherDistances = (apt.distances || []).filter(d => d.poi_id !== id);
        return {
          ...apt,
          distances: [
            ...otherDistances,
            { poi_id: id, poi_name: name, poi_address: address, normal_time_mins: normal_time, rush_hour_time_mins: rush_hour_time, distance_miles: parseFloat(dist.toFixed(2)) }
          ]
        };
      }));
      setApartments(updatedApts);
      localStorage.setItem('vibenest_apartments', JSON.stringify(updatedApts));
    } else {
      try {
        const coords = await clientGeocode(address);
        const res = await fetch(`${API_URL}/api/pois/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, address, icon: finalIcon, latitude: coords.lat, longitude: coords.lon })
        });
        const updatedPoi = await res.json();
        setPois(prev => prev.map(p => p.id === id ? updatedPoi : p));
        fetch(`${API_URL}/api/apartments`).then(r => r.json()).then(setApartments);
      } catch (err) {
        console.error('Error updating POI:', err);
      }
    }
  };

  // Delete Apartment
  const handleDeleteApartment = async (id) => {
    if (!confirm('Are you sure you want to delete this apartment listing?')) return;
    const updatedApts = apartments.filter(a => a.id !== id);
    setApartments(updatedApts);

    if (isStandalone) {
      localStorage.setItem('vibenest_apartments', JSON.stringify(updatedApts));
    } else {
      try {
        await fetch(`${API_URL}/api/apartments/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Error deleting apartment:', err);
      }
    }
  };

  const handleExportData = () => {
    const dataStr = JSON.stringify({
      apartments: apartments,
      pois: pois,
      criteria: criteria,
      settings: settings
    }, null, 2);
    
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = 'vibenest-backup.json';
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleImportData = (e) => {
    const fileReader = new FileReader();
    const file = e.target.files[0];
    if (!file) return;

    fileReader.onload = async (event) => {
      try {
        const parsedData = JSON.parse(event.target.result);
        if (!parsedData.apartments && !parsedData.pois && !parsedData.criteria) {
          alert("Invalid backup file. Could not find data fields.");
          return;
        }

        if (confirm("Importing this file will overwrite all current listings and settings. Do you want to proceed?")) {
          const importedApts = parsedData.apartments || [];
          const importedPois = parsedData.pois || [];
          const importedCriteria = parsedData.criteria || [];
          const importedSettings = parsedData.settings || {};

          if (isStandalone) {
            setApartments(importedApts);
            setPois(importedPois);
            setCriteria(importedCriteria);
            setSettings(importedSettings);

            localStorage.setItem('vibenest_apartments', JSON.stringify(importedApts));
            localStorage.setItem('vibenest_pois', JSON.stringify(importedPois));
            localStorage.setItem('vibenest_criteria', JSON.stringify(importedCriteria));
            localStorage.setItem('vibenest_settings', JSON.stringify(importedSettings));
            alert("Data imported successfully to browser local storage!");
          } else {
            alert("Importing via JSON is supported in Standalone Offline Mode. For Docker, data is persisted in database.js.");
          }
        }
      } catch (err) {
        alert("Error parsing JSON backup file: " + err.message);
      }
    };
    fileReader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 flex flex-col">
      {/* Top Glass Header */}
      <header className="sticky top-0 z-30 w-full glass-panel px-6 py-4 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-primary-500 to-indigo-600 rounded-xl shadow-lg shadow-primary-500/20">
            <Sparkles className="h-6 w-6 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">VibeNest</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-xs text-slate-400 font-medium">Weighted Apartment Comparison</p>
              <span className={`w-1.5 h-1.5 rounded-full ${isStandalone ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`}></span>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                {isStandalone ? 'Standalone' : 'Docker API'}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center bg-slate-950/60 p-1.5 rounded-xl border border-slate-800/80">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${activeTab === 'dashboard' ? 'bg-primary-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'}`}
          >
            <Layers className="h-4 w-4" />
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('listings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${activeTab === 'listings' ? 'bg-primary-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'}`}
          >
            <Home className="h-4 w-4" />
            Listings ({apartments.length})
          </button>
          <button 
            onClick={() => setActiveTab('criteria')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${activeTab === 'criteria' ? 'bg-primary-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'}`}
          >
            <Sliders className="h-4 w-4" />
            Weight sliders
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${activeTab === 'settings' ? 'bg-primary-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'}`}
          >
            <SettingsIcon className="h-4 w-4" />
            Settings
          </button>
        </nav>
      </header>

      {/* Main Workspace Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-6 md:p-8 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-96 gap-4">
            <div className="h-10 w-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-semibold text-slate-400">Loading your nests...</p>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardView 
                scoredApartments={scoredApartments} 
                pois={pois} 
                criteria={criteria} 
                settings={settings}
                onNavigate={(tab) => setActiveTab(tab)} 
              />
            )}

            {activeTab === 'listings' && (
              <ListingsView 
                scoredApartments={filteredApartments}
                allScoredApartments={scoredApartments}
                pois={pois}
                criteria={criteria}
                settings={settings}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                priceRange={priceRange}
                setPriceRange={setPriceRange}
                selectedCriteriaFilter={selectedCriteriaFilter}
                setSelectedCriteriaFilter={setSelectedCriteriaFilter}
                sortBy={sortBy}
                setSortBy={setSortBy}
                minRating={minRating}
                setMinRating={setMinRating}
                minBeds={minBeds}
                setMinBeds={setMinBeds}
                minBaths={minBaths}
                setMinBaths={setMinBaths}
                onDelete={handleDeleteApartment}
                onEdit={(apt) => { setEditingApartment(apt); setIsAddModalOpen(true); }}
                onAddClick={(apt) => { setEditingApartment(null); setIsAddModalOpen(true); }}
                hoveredFloorplan={hoveredFloorplan}
                setHoveredFloorplan={setHoveredFloorplan}
              />
            )}

            {activeTab === 'criteria' && (
              <CriteriaView 
                criteria={criteria} 
                settings={settings}
                onWeightChange={handleWeightChange} 
                onAddCriteria={handleAddCriteria} 
                onDeleteCriteria={handleDeleteCriteria} 
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView 
                settings={settings} 
                pois={pois} 
                onSaveApiKey={handleSaveApiKey} 
                onSaveSetting={handleSaveSetting}
                onAddPoi={handleAddPoi} 
                onUpdatePoi={handleUpdatePoi} 
                onDeletePoi={handleDeletePoi} 
                onExportData={handleExportData}
                onImportData={handleImportData}
              />
            )}
          </>
        )}
      </main>

      {/* Global Floorplan Image Hover Zoom Overlay */}
      {hoveredFloorplan && (
        <div 
          className="fixed z-50 pointer-events-none p-1 bg-slate-900 border border-primary-500/40 rounded-xl shadow-2xl overflow-hidden backdrop-blur-xl animate-fade-in"
          style={{
            top: `${Math.min(hoveredFloorplan.y + 15, window.innerHeight - 460)}px`,
            left: `${Math.min(hoveredFloorplan.x + 15, window.innerWidth - 600)}px`,
            width: '580px',
            height: '440px'
          }}
        >
          <img 
            src={`${API_URL}${hoveredFloorplan.url}`} 
            alt="Magnified Floorplan" 
            className="w-full h-full object-contain"
          />
        </div>
      )}

      {isAddModalOpen && (
        <ApartmentModal 
          apartment={editingApartment} 
          pois={pois}
          criteria={criteria}
          settings={settings}
          isStandalone={isStandalone}
          onWeightChange={handleWeightChange}
          onAddCriteria={handleAddCriteria}
          onClose={() => setIsAddModalOpen(false)}
          onSave={fetchData}
        />
      )}
    </div>
  );
}

// ----------------- HELPERS & SUB-COMPONENTS -----------------

// Priority weight labels
const getPriorityLabel = (w) => {
  if (w === 5) return 'Critical';
  if (w === 4) return 'High';
  if (w === 3) return 'Medium';
  if (w === 2) return 'Low';
  return 'Nice to Have';
};

// Default POI Emojis by name
const getDefaultPoiEmoji = (name = '') => {
  const lower = name.toLowerCase();
  if (lower.includes('work')) return '💼';
  if (lower.includes('office')) return '🏢';
  if (lower.includes('gym') || lower.includes('workout') || lower.includes('fitness')) return '🏋️';
  if (lower.includes('grocery') || lower.includes('market') || lower.includes('trader') || lower.includes('whole foods') || lower.includes('heb') || lower.includes('target') || lower.includes('store') || lower.includes('shop')) return '🛒';
  if (lower.includes('park') || lower.includes('trail') || lower.includes('outdoor') || lower.includes('nature') || lower.includes('lake') || lower.includes('beach')) return '🌳';
  if (lower.includes('coffee') || lower.includes('cafe') || lower.includes('starbucks') || lower.includes('dunkin')) return '☕';
  if (lower.includes('restaurant') || lower.includes('food') || lower.includes('eat') || lower.includes('dinner') || lower.includes('lunch') || lower.includes('bar') || lower.includes('pub')) return '🍴';
  if (lower.includes('school') || lower.includes('university') || lower.includes('college') || lower.includes('class')) return '🎓';
  return '📍';
};

// Reusable premium discrete BeadedSlider component
function BeadedSlider({ value, onChange, min = 1, max = 5, colorClass = 'primary' }) {
  const steps = [];
  for (let i = min; i <= max; i++) {
    steps.push(i);
  }
  const percentage = ((value - min) / (max - min)) * 100;
  
  const accentColor = colorClass === 'primary' ? 'bg-primary-500 text-primary-500' : 'bg-pink-500 text-pink-500';
  const ringColor = colorClass === 'primary' ? 'ring-primary-500' : 'ring-pink-500';
  const bgLightColor = colorClass === 'primary' ? 'bg-primary-300' : 'bg-pink-300';

  return (
    <div className="relative w-full flex items-center h-6 select-none my-1">
      {/* Background Track */}
      <div className="absolute left-0 right-0 h-1 bg-slate-800 rounded-full pointer-events-none"></div>
      
      {/* Active Fill Track */}
      <div 
        className={`absolute left-0 h-1 rounded-full pointer-events-none ${accentColor}`}
        style={{ width: `${percentage}%` }}
      ></div>

      {/* Discrete Steps Ticks (Beads) */}
      <div className="absolute left-0 right-0 h-1 flex justify-between pointer-events-none px-1">
        {steps.map((val) => {
          const isActive = val <= value;
          return (
            <span 
              key={val} 
              className={`w-1.5 h-1.5 rounded-full -translate-y-[1px] transition-all duration-200 ${
                isActive ? `${bgLightColor} ring-[3px] ${ringColor} scale-110` : 'bg-slate-700'
              }`}
            ></span>
          );
        })}
      </div>

      {/* Range Input */}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className={`absolute inset-0 w-full h-full appearance-none bg-transparent cursor-ew-resize focus:outline-none z-10 beaded-slider-input ${accentColor}`}
        style={{ WebkitAppearance: 'none' }}
      />
    </div>
  );
}

// 1. DASHBOARD VIEW
function DashboardView({ scoredApartments, pois, criteria, settings = {}, onNavigate }) {
  const totalListings = scoredApartments.length;
  const avgRent = totalListings > 0 
    ? Math.round(scoredApartments.reduce((acc, a) => acc + (a.rent || 0), 0) / totalListings) 
    : 0;
  const bestMatch = totalListings > 0 
    ? [...scoredApartments].sort((a, b) => (b.combinedScore || 0) - (a.combinedScore || 0))[0] 
    : null;

  // Prepare chart data (top 5 scoring apartments)
  const chartData = [...scoredApartments]
    .sort((a, b) => (b.combinedScore || 0) - (a.combinedScore || 0))
    .slice(0, 5)
    .map(apt => {
      if (settings.SHOPPING_MODE === 'single') {
        return {
          name: apt.name,
          'Match Score': apt.userScore
        };
      }
      return {
        name: apt.name,
        'My Score': apt.userScore,
        "Partner's Score": apt.partnerScore,
        'Combined Match': apt.combinedScore
      };
    });

  // Average commute times
  const computeAvgPOICommute = (poiId) => {
    let count = 0;
    let total = 0;
    scoredApartments.forEach(apt => {
      const dist = apt.distances?.find(d => d.poi_id === poiId);
      if (dist && dist.normal_time_mins) {
        total += dist.normal_time_mins;
        count++;
      }
    });
    return count > 0 ? Math.round(total / count) : null;
  };

  // Find map center: default to first apartment with coords, else first POI with coords, else US center
  const mapCenter = scoredApartments.find(a => a.latitude && a.longitude)
    ? [scoredApartments.find(a => a.latitude && a.longitude).latitude, scoredApartments.find(a => a.latitude && a.longitude).longitude]
    : pois.find(p => p.latitude && p.longitude)
      ? [pois.find(p => p.latitude && p.longitude).latitude, pois.find(p => p.latitude && p.longitude).longitude]
      : [37.7749, -122.4194]; // Default SF

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Banner */}
      <div className="p-8 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 border border-slate-800/80 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary-600/10 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-secondary-500/10 rounded-full blur-[80px] pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl text-white">Find Your Perfect VibeNest</h2>
            <p className="text-slate-300 font-medium max-w-xl">
              Compare apartments based on custom pros & cons weighted separately for you and your partner. Check commute matrices and floorplans in one unified dashboard.
            </p>
          </div>
          <button 
            onClick={() => onNavigate('listings')}
            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-primary-500 to-indigo-600 hover:from-primary-600 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-primary-500/25 transform hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 self-start md:self-auto"
          >
            <Plus className="h-5 w-5" />
            Add Apartment
          </button>
        </div>
      </div>

      {/* Overview Statistics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-primary-500/10 text-primary-400 rounded-xl">
            <Home className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Listings</p>
            <h3 className="text-2xl font-bold mt-1">{totalListings}</h3>
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Average Rent</p>
            <h3 className="text-2xl font-bold mt-1">${avgRent}<span className="text-sm text-slate-400 font-normal">/mo</span></h3>
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl">
            <Star className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Highest Match</p>
            <h3 className="text-2xl font-bold mt-1">
              {bestMatch ? (bestMatch.combinedScore !== null ? `${bestMatch.combinedScore}%` : '--') : 'N/A'}
            </h3>
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-secondary-500/10 text-secondary-400 rounded-xl">
            <Navigation className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">POI Locations</p>
            <h3 className="text-2xl font-bold mt-1">{pois.length}</h3>
          </div>
        </div>
      </div>

      {/* Main Layout (Map and Scoring comparisons) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Score chart / list of top apartments */}
        <div className="lg:col-span-7 space-y-8">
          {/* Recharts Bar Chart */}
          <div className="glass-card p-6 rounded-2xl">
            <h3 className="text-lg font-bold tracking-tight text-white mb-6 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary-400" />
              Top Match comparison
            </h3>
            {chartData.length > 0 ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} stroke="#64748b" />
                    <ChartTooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem' }} 
                      labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                    />
                    <Legend />
                    {settings.SHOPPING_MODE === 'single' ? (
                      <Bar dataKey="Match Score" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    ) : (
                      <>
                        <Bar dataKey="My Score" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Partner's Score" fill="#ec4899" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Combined Match" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                      </>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-80 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl text-slate-500">
                <Layers className="h-10 w-10 mb-2 opacity-50" />
                <p>No listings added yet to display charts.</p>
              </div>
            )}
          </div>

          {/* Ranking list */}
          <div className="glass-card p-6 rounded-2xl">
            <h3 className="text-lg font-bold tracking-tight text-white mb-4">Apartment Rankings</h3>
            {totalListings > 0 ? (
              <div className="divide-y divide-slate-800">
                {scoredApartments
                  .sort((a, b) => b.combinedScore - a.combinedScore)
                  .map((apt, index) => (
                    <div key={apt.id} className="py-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 flex items-center justify-center rounded-lg font-bold text-sm ${
                          index === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                          index === 1 ? 'bg-slate-400/20 text-slate-300 border border-slate-400/30' :
                          index === 2 ? 'bg-amber-700/20 text-amber-600 border border-amber-700/30' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {index + 1}
                        </div>
                        <div>
                          <h4 className="font-semibold text-white">{apt.name}</h4>
                          <p className="text-xs text-slate-400 mt-0.5">{apt.address || 'No Address'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {settings.SHOPPING_MODE === 'single' ? (
                          <div className="text-right">
                            <p className="text-xs text-slate-500">Match</p>
                            <p className="font-bold text-primary-400">
                              {apt.combinedScore !== null ? `${apt.combinedScore}%` : '--'}
                            </p>
                          </div>
                        ) : (
                          <>
                            <div className="text-right">
                              <p className="text-xs text-slate-500">Combined</p>
                              <p className="font-bold text-primary-400">
                                {apt.combinedScore !== null ? `${apt.combinedScore}%` : '--'}
                              </p>
                            </div>
                            <div className="text-right text-xs text-slate-500 border-l border-slate-800 pl-4 space-y-0.5">
                              <p>Me: <span className="font-semibold text-purple-400">{apt.userScore !== null ? `${apt.userScore}%` : '--'}</span></p>
                              <p>Partner: <span className="font-semibold text-pink-400">{apt.partnerScore !== null ? `${apt.partnerScore}%` : '--'}</span></p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 py-4 text-center">Add apartment listings to see rankings.</p>
            )}
          </div>
        </div>

        {/* Right Side: Leaflet Interactive Map */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-card p-4 rounded-2xl h-[560px] flex flex-col relative overflow-hidden">
            <h3 className="text-lg font-bold tracking-tight text-white mb-4 px-2 flex items-center gap-2">
              <MapIcon className="h-5 w-5 text-indigo-400" />
              GeoNest Mapping
            </h3>
            
            <div className="flex-1 w-full rounded-xl overflow-hidden border border-slate-800">
              <MapContainer 
                center={mapCenter} 
                zoom={12} 
                style={{ height: '100%', width: '100%' }}
              >
                <ChangeMapView center={mapCenter} zoom={12} />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                
                {/* Apartments markers */}
                {scoredApartments
                  .filter(a => a.latitude && a.longitude)
                  .map(apt => (
                    <Marker 
                      key={`apt-${apt.id}`} 
                      position={[apt.latitude, apt.longitude]} 
                      icon={apartmentMarkerIcon}
                    >
                      <Popup>
                        <div className="space-y-2.5 p-1 font-sans w-72 text-slate-100">
                          <div>
                            <h4 className="font-bold text-sm text-white truncate" title={apt.name}>{apt.name}</h4>
                            <p className="text-[11px] text-slate-400 leading-normal line-clamp-2 mt-0.5">{apt.address || 'Address not listed'}</p>
                          </div>
                          
                          {(apt.bedrooms || apt.bathrooms) && (
                            <div className="text-[10px] text-slate-300 font-bold bg-slate-950/40 border border-slate-800 px-2 py-1 rounded-md flex items-center gap-1.5 w-fit">
                              <span>{apt.bedrooms ? `${apt.bedrooms} Bed${apt.bedrooms > 1 ? 's' : ''}` : '--'}</span>
                              <span className="text-slate-600">•</span>
                              <span>{apt.bathrooms ? `${apt.bathrooms} Bath${apt.bathrooms !== 1 ? 's' : ''}` : '--'}</span>
                            </div>
                          )}

                          {apt.floorplan_image && (
                            <div className="w-full h-36 rounded-lg overflow-hidden border border-slate-850 bg-slate-950 mt-1.5 flex items-center justify-center p-1">
                              <img 
                                src={`${API_URL}${apt.floorplan_image}`} 
                                alt="Floorplan preview" 
                                className="max-w-full max-h-full object-contain opacity-95 transition hover:scale-105 duration-200"
                              />
                            </div>
                          )}

                          <div className="flex justify-between items-center gap-4 text-xs font-bold pt-1.5 border-t border-slate-805 mt-2">
                            <span className="text-emerald-400">${apt.rent ? apt.rent.toLocaleString() : '--'}/mo</span>
                            <span className="text-primary-400">
                              {apt.combinedScore !== null ? `${apt.combinedScore}% Match` : '--'}
                            </span>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}

                {/* POIs markers */}
                {pois
                  .filter(p => p.latitude && p.longitude)
                  .map(poi => (
                    <Marker 
                      key={`poi-${poi.id}`} 
                      position={[poi.latitude, poi.longitude]} 
                      icon={createPoiDivIcon(poi.icon)}
                    >
                      <Popup>
                        <div className="p-1 font-sans text-slate-100 w-44">
                          <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
                            <span className="text-base">{poi.icon || '📍'}</span>
                            {poi.name}
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-1 leading-normal">{poi.address || 'No Address'}</p>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
              </MapContainer>
            </div>
            
            <div className="mt-4 flex gap-4 text-xs font-semibold text-slate-400 justify-center">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#a78bfa]"></span>Apartments</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#06b6d4]"></span>POIs / Work</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// 2. LISTINGS VIEW (Search, filters, card list, hover zoom floorplans)
function ListingsView({ 
  scoredApartments, 
  allScoredApartments,
  pois, 
  criteria, 
  settings = {},
  searchQuery, 
  setSearchQuery, 
  priceRange, 
  setPriceRange, 
  selectedCriteriaFilter, 
  setSelectedCriteriaFilter, 
  sortBy, 
  setSortBy, 
  minRating,
  setMinRating,
  minBeds,
  setMinBeds,
  minBaths,
  setMinBaths,
  onDelete, 
  onEdit, 
  onAddClick,
  hoveredFloorplan,
  setHoveredFloorplan 
}) {
  const [expandedApt, setExpandedApt] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [viewFormat, setViewFormat] = useState('grid');
  const dropdownRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Compute criteria match frequency across all scored apartments
  const criteriaCounts = {};
  criteria.forEach(crit => {
    criteriaCounts[crit.id] = 0;
  });

  allScoredApartments.forEach(apt => {
    apt.criteria?.forEach(ac => {
      if (ac.value === 1) {
        criteriaCounts[ac.criteria_id] = (criteriaCounts[ac.criteria_id] || 0) + 1;
      }
    });
  });

  // Sort criteria by match frequency descending
  const sortedCriteria = [...criteria].sort((a, b) => {
    return (criteriaCounts[b.id] || 0) - (criteriaCounts[a.id] || 0);
  });

  // Split into Top 5 and others
  const top5Criteria = sortedCriteria.slice(0, 5);
  const otherCriteria = sortedCriteria.slice(5);

  // Filter out criteria that are set to default to avoid filtering empty lists
  const activeFilterCount = Object.values(selectedCriteriaFilter).filter(Boolean).length;

  const toggleCriteriaFilter = (id) => {
    setSelectedCriteriaFilter(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const getAttributeFacetCount = (critId) => {
    return allScoredApartments.filter(apt => {
      // 1. Text Search Filter
      const matchesSearch = 
        apt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (apt.address && apt.address.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // 2. Price Filter
      const matchesRent = 
        (!priceRange.min || apt.rent >= priceRange.min) &&
        (!priceRange.max || apt.rent <= priceRange.max);
      
      // 3. Match active criteria filters, excluding the target critId itself
      const matchesCriteria = Object.keys(selectedCriteriaFilter).every(filterIdStr => {
        const filterId = parseInt(filterIdStr);
        const isActive = !!selectedCriteriaFilter[filterId];
        if (filterId === critId) return true;
        if (!isActive) return true;
        
        const aptCrit = apt.criteria?.find(ac => ac.criteria_id === filterId);
        return aptCrit && aptCrit.value === 1;
      });

      // 4. Rating Filter
      const matchesRating = !minRating || (apt.google_review_score !== null && apt.google_review_score >= minRating);

      // 5. Beds Filter
      const matchesBeds = !minBeds || (apt.bedrooms !== null && apt.bedrooms >= parseInt(minBeds));

      // 6. Baths Filter
      const matchesBaths = !minBaths || (apt.bathrooms !== null && apt.bathrooms >= parseFloat(minBaths));

      // 7. Must satisfy target criteria
      const aptCritTarget = apt.criteria?.find(ac => ac.criteria_id === critId);
      const matchesTarget = aptCritTarget && aptCritTarget.value === 1;

      return matchesSearch && matchesRent && matchesCriteria && matchesRating && matchesBeds && matchesBaths && matchesTarget;
    }).length;
  };

  const handleMouseMove = (e, imageUrl) => {
    setHoveredFloorplan({
      url: imageUrl,
      x: e.clientX,
      y: e.clientY
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Filter and Search Bar Dashboard */}
      <div className="glass-card p-6 rounded-2xl space-y-4 relative z-20">
        {/* Row 1: Search Box (Full Width) */}
        <div className="relative w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by apartment name or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3.5 bg-slate-950/80 border border-slate-800 rounded-xl focus:border-primary-500 focus:outline-none text-sm transition text-slate-200"
          />
        </div>

        {/* Row 2: Secondary Filters */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <div className="flex flex-wrap items-center gap-3">
            {/* Sort Dropdown */}
            <div className="relative flex items-center bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2">
              <span className="text-xs text-slate-400 mr-2 font-medium">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-transparent text-sm font-semibold focus:outline-none cursor-pointer text-slate-200"
              >
                <option value="combined_score" className="bg-slate-950 text-slate-200">
                  {settings.SHOPPING_MODE === 'single' ? 'Match Score' : 'Combined Match'}
                </option>
                <option value="my_score" className="bg-slate-950 text-slate-200">My Score</option>
                {settings.SHOPPING_MODE !== 'single' && (
                  <option value="partner_score" className="bg-slate-950 text-slate-200">Partner's Score</option>
                )}
                <option value="rent" className="bg-slate-950 text-slate-200">Rent Price</option>
                <option value="google_review" className="bg-slate-950 text-slate-200">Google Review</option>
              </select>
            </div>

            {/* Price Filter Box */}
            <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 gap-2 text-sm text-slate-400">
              <span className="text-xs font-medium">Rent:</span>
              <input
                type="number"
                placeholder="Min"
                value={priceRange.min || ''}
                onChange={(e) => setPriceRange(prev => ({ ...prev, min: parseInt(e.target.value) || 0 }))}
                className="w-16 bg-transparent focus:outline-none text-white text-center border-b border-slate-800"
              />
              <span>-</span>
              <input
                type="number"
                placeholder="Max"
                value={priceRange.max || ''}
                onChange={(e) => setPriceRange(prev => ({ ...prev, max: parseInt(e.target.value) || 10000 }))}
                className="w-16 bg-transparent focus:outline-none text-white text-center border-b border-slate-800"
              />
            </div>

            {/* Google Review Min Filter */}
            <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 gap-1.5 text-sm text-slate-400">
              <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />
              <span className="text-xs font-medium">Min ⭐:</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="5"
                placeholder="0.0"
                value={minRating || ''}
                onChange={(e) => setMinRating(parseFloat(e.target.value) || 0)}
                className="w-10 bg-transparent focus:outline-none text-white text-center border-b border-slate-800 font-semibold"
              />
            </div>

            {/* Beds Filter */}
            <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 gap-1.5 text-sm text-slate-400">
              <Bed className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" />
              <span className="text-xs font-medium">Beds:</span>
              <select
                value={minBeds}
                onChange={(e) => setMinBeds(e.target.value)}
                className="bg-transparent text-xs font-bold focus:outline-none cursor-pointer text-slate-200"
              >
                <option value="" className="bg-slate-950 text-slate-400">Any</option>
                <option value="1" className="bg-slate-950 text-slate-200">1+</option>
                <option value="2" className="bg-slate-950 text-slate-200">2+</option>
                <option value="3" className="bg-slate-950 text-slate-200">3+</option>
                <option value="4" className="bg-slate-950 text-slate-200">4+</option>
              </select>
            </div>

            {/* Baths Filter */}
            <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 gap-1.5 text-sm text-slate-400">
              <span className="text-xs font-medium">Baths:</span>
              <select
                value={minBaths}
                onChange={(e) => setMinBaths(e.target.value)}
                className="bg-transparent text-xs font-bold focus:outline-none cursor-pointer text-slate-200"
              >
                <option value="" className="bg-slate-950 text-slate-400">Any</option>
                <option value="1" className="bg-slate-950 text-slate-200">1+</option>
                <option value="1.5" className="bg-slate-950 text-slate-200">1.5+</option>
                <option value="2" className="bg-slate-950 text-slate-200">2+</option>
                <option value="2.5" className="bg-slate-950 text-slate-200">2.5+</option>
                <option value="3" className="bg-slate-950 text-slate-200">3+</option>
              </select>
            </div>

            {/* Layout Toggle Format */}
            <div className="flex bg-slate-950/80 border border-slate-800 rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => setViewFormat('grid')}
                className={`p-1.5 rounded-lg transition-all ${viewFormat === 'grid' ? 'bg-primary-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                title="Grid Layout"
              >
                <LayoutGrid className="h-4.5 w-4.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewFormat('list')}
                className={`p-1.5 rounded-lg transition-all ${viewFormat === 'list' ? 'bg-primary-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                title="List Layout"
              >
                <List className="h-4.5 w-4.5" />
              </button>
            </div>

            <button 
              onClick={onAddClick}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold rounded-xl shadow-md transition"
            >
              <Plus className="h-4 w-4" />
              Add Listing
            </button>
          </div>
        </div>

        {/* Attribute Filters (Top 5 + Dropdown checklist) */}
        <div className="border-t border-slate-800/80 pt-4 space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Filter by Attributes ({activeFilterCount} active)</p>
          <div className="flex flex-wrap items-center gap-2">
            {/* Top 5 Criteria */}
            {top5Criteria.map(crit => {
              const facetCount = getAttributeFacetCount(crit.id);
              return (
                <button
                  key={`filter-${crit.id}`}
                  onClick={() => toggleCriteriaFilter(crit.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    selectedCriteriaFilter[crit.id]
                      ? 'bg-primary-600/20 text-primary-300 border-primary-500/50 font-semibold'
                      : 'bg-slate-950/40 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {crit.name} ({facetCount})
                </button>
              );
            })}

            {/* Dropdown Checklist for Remaining Criteria */}
            {otherCriteria.length > 0 && (
              <div className="relative inline-block" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-full border border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 transition-all font-semibold"
                >
                  More Attributes...
                  <ChevronsUpDown className="h-3 w-3" />
                </button>

                {isDropdownOpen && (
                  <div className="absolute left-0 mt-2 bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-2xl z-20 max-h-60 overflow-y-auto space-y-2 w-64 backdrop-blur-xl bg-slate-900/90">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1 border-b border-slate-850 pb-1">Additional Criteria</p>
                    {otherCriteria.map(crit => {
                      const facetCount = getAttributeFacetCount(crit.id);
                      return (
                        <label
                          key={`drop-filter-${crit.id}`}
                          className="flex items-center gap-2.5 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer py-1.5 px-1 hover:bg-slate-950/40 rounded-lg select-none"
                        >
                          <input
                            type="checkbox"
                            checked={!!selectedCriteriaFilter[crit.id]}
                            onChange={() => toggleCriteriaFilter(crit.id)}
                            className="rounded border-slate-800 bg-slate-950 text-primary-600 focus:ring-0 focus:ring-offset-0 cursor-pointer h-3.5 w-3.5"
                          />
                          <span className="truncate flex-1 pr-2">{crit.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono font-bold flex-shrink-0">({facetCount})</span>
                          <span className={`text-[8px] px-1.5 py-0.2 rounded font-bold uppercase ml-2 flex-shrink-0 ${crit.type === 'pro' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                            {crit.type}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cards List */}
      {scoredApartments.length > 0 ? (
        <div className={viewFormat === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4"}>
          {scoredApartments.map(apt => {
            const isExpanded = expandedApt === apt.id;
            
            return (
              <div 
                key={`apt-card-${apt.id}`}
                className={viewFormat === 'grid'
                  ? "glass-card rounded-2xl overflow-hidden flex flex-col glass-card-hover group border-slate-800/80"
                  : "glass-card rounded-2xl overflow-hidden flex flex-col md:flex-row glass-card-hover group border-slate-800/80 p-4 gap-6 items-stretch"
                }
              >
                
                {/* Header score display */}
                <div className={viewFormat === 'grid'
                  ? "relative h-44 bg-slate-950 flex items-center justify-center border-b border-slate-800 overflow-hidden flex-shrink-0"
                  : "relative w-full md:w-56 h-44 md:h-auto bg-slate-950 flex items-center justify-center rounded-xl overflow-hidden border border-slate-800 flex-shrink-0"
                }>
                  
                  {/* Floorplan image thumbnail */}
                  {apt.floorplan_image ? (
                    <div 
                      className="absolute inset-0 w-full h-full opacity-35 group-hover:opacity-50 transition cursor-crosshair"
                      onMouseEnter={(e) => handleMouseMove(e, apt.floorplan_image)}
                      onMouseMove={(e) => handleMouseMove(e, apt.floorplan_image)}
                      onMouseLeave={() => setHoveredFloorplan(null)}
                    >
                      <img 
                        src={`${API_URL}${apt.floorplan_image}`} 
                        alt="Floorplan thumbnail" 
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-2 right-2 p-1.5 bg-slate-950/80 rounded-lg text-xs font-semibold text-slate-300 flex items-center gap-1 border border-slate-800">
                        <ZoomIn className="h-3 w-3" />
                        Hover Zoom
                      </div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 bg-slate-950/90 gap-1.5 select-none">
                      <FileText className="h-10 w-10 opacity-30" />
                      <span className="text-xs font-medium uppercase tracking-wider">No Floorplan Uploaded</span>
                    </div>
                  )}

                  {/* Top rating overlay */}
                  <div className="absolute top-4 right-4 flex gap-1.5">
                    <span className="px-2.5 py-1 bg-primary-600/90 backdrop-blur-md rounded-lg text-xs font-bold text-white shadow-lg shadow-primary-500/25">
                      {apt.combinedScore !== null ? `${apt.combinedScore}% Match` : '--'}
                    </span>
                  </div>

                  {/* Left bottom details */}
                  <div className="absolute bottom-4 left-4 z-10">
                    <span className="text-2xl font-extrabold text-white">${apt.rent ? apt.rent.toLocaleString() : '--'}</span>
                    <span className="text-slate-300 text-xs font-semibold block">Monthly Rent</span>
                  </div>
                </div>

                {/* Body Content */}
                <div className={viewFormat === 'grid' ? "p-6 flex-1 flex flex-col" : "p-2 md:p-4 flex-1 flex flex-col justify-between"}>
                  <div>
                    <div className="flex justify-between items-start gap-3 w-full">
                      {apt.url ? (
                        <a 
                          href={apt.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-lg font-bold text-white hover:text-primary-400 hover:underline transition flex items-center gap-1.5 group/link min-w-0 flex-1"
                        >
                          <span className="truncate" title={apt.name}>{apt.name}</span>
                          <ExternalLink className="h-3.5 w-3.5 opacity-50 group-hover/link:opacity-100 transition flex-shrink-0" />
                        </a>
                      ) : (
                        <h3 className="text-lg font-bold text-white truncate min-w-0 flex-1" title={apt.name}>{apt.name}</h3>
                      )}
                      
                      {apt.google_review_score ? (
                        <span className="flex items-center gap-1 text-xs font-extrabold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-lg border border-amber-500/20 whitespace-nowrap shadow-sm">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          {apt.google_review_score}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-950/60 px-2 py-0.5 rounded-lg border border-slate-800 whitespace-nowrap">
                          No Review
                        </span>
                      )}
                    </div>

                    {apt.address ? (
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(apt.address)}`} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-xs text-slate-400 hover:text-primary-400 hover:underline flex items-center gap-1 mt-1.5 font-medium transition"
                      >
                        <MapPin className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                        <span className="truncate">{apt.address}</span>
                      </a>
                    ) : (
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-1.5 font-medium italic">
                        <MapPin className="h-3.5 w-3.5 text-slate-600 flex-shrink-0" />
                        <span>Address not listed</span>
                      </p>
                    )}

                    {/* Bed / Bath count display */}
                    {(apt.bedrooms || apt.bathrooms) && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-2 font-medium bg-slate-950/20 px-2.5 py-1 rounded-lg border border-slate-900/60 w-fit">
                        <Bed className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                        <span>
                          {apt.bedrooms ? `${apt.bedrooms} Bed${apt.bedrooms > 1 ? 's' : ''}` : '--'}
                        </span>
                        <span className="text-slate-600 font-bold select-none">•</span>
                        <span>
                          {apt.bathrooms ? `${apt.bathrooms} Bath${apt.bathrooms !== 1 ? 's' : ''}` : '--'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Scores and Commute Info block */}
                  <div className={viewFormat === 'grid' ? "" : "grid grid-cols-1 sm:grid-cols-2 gap-4 my-4 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/80"}>
                    {/* Scores breakdown preview */}
                    {settings.SHOPPING_MODE !== 'single' && (
                      <div className={viewFormat === 'grid' 
                        ? "grid grid-cols-2 gap-4 my-5 bg-slate-950/40 p-3 rounded-xl border border-slate-800/80" 
                        : "grid grid-cols-2 gap-4 flex-1 items-center"
                      }>
                        <div className="text-center">
                          <p className="text-[10px] uppercase font-bold text-purple-400 tracking-wider">My Score</p>
                          <p className="text-lg font-extrabold text-slate-100 mt-0.5">{apt.userScore !== null ? `${apt.userScore}%` : '--'}</p>
                        </div>
                        <div className="text-center border-l border-slate-800/80">
                          <p className="text-[10px] uppercase font-bold text-pink-400 tracking-wider">Partner's Score</p>
                          <p className="text-lg font-extrabold text-slate-100 mt-0.5">{apt.partnerScore !== null ? `${apt.partnerScore}%` : '--'}</p>
                        </div>
                      </div>
                    )}

                    {/* Quick Commute details */}
                    {apt.distances && apt.distances.length > 0 && (
                      <div className={viewFormat === 'grid' 
                        ? "space-y-1.5 mb-5 text-xs" 
                        : "space-y-1.5 text-xs flex-1 flex flex-col justify-center border-t sm:border-t-0 sm:border-l border-slate-800/80 pt-3 sm:pt-0 sm:pl-4"
                      }>
                        {apt.distances.slice(0, 2).map(dist => (
                          <div key={`comm-${apt.id}-${dist.poi_id}`} className="flex justify-between items-center text-slate-300">
                            <span className="font-semibold text-slate-400 flex items-center gap-1.5">
                              {dist.poi_name.toLowerCase().includes('work') ? (
                                <Briefcase className="h-3.5 w-3.5 text-indigo-400" />
                              ) : (
                                <ShoppingBag className="h-3.5 w-3.5 text-emerald-400" />
                              )}
                              {dist.poi_name}
                            </span>
                            <span className="font-mono">
                              {dist.normal_time_mins ? `${dist.normal_time_mins}m` : '--'} / 
                              <span className="text-rose-400 font-bold ml-1">
                                {dist.rush_hour_time_mins ? ` ${dist.rush_hour_time_mins}m` : ' --'}
                              </span>
                              {dist.distance_miles ? ` (${dist.distance_miles} mi)` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Expanded block containing specific pros/cons listing */}
                  {isExpanded && (
                    <div className="mt-2 pt-4 border-t border-slate-800/80 space-y-4 animate-fade-in">
                      {/* Criteria matches lists */}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="space-y-1.5">
                          <p className="font-bold text-emerald-400 tracking-wide uppercase text-[10px]">Pros Met</p>
                          {apt.criteria?.filter(ac => ac.value === 1 && ac.type === 'pro').length > 0 ? (
                            apt.criteria
                              .filter(ac => ac.value === 1 && ac.type === 'pro')
                              .map(ac => (
                                <div key={`ex-crit-${apt.id}-${ac.criteria_id}`} className="flex items-center gap-1 text-slate-300">
                                  <Check className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                                  <span>{ac.name}</span>
                                </div>
                              ))
                          ) : (
                            <p className="text-slate-500 italic">None</p>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <p className="font-bold text-rose-400 tracking-wide uppercase text-[10px]">Cons Flagged</p>
                          {apt.criteria?.filter(ac => ac.value === 1 && ac.type === 'con').length > 0 ? (
                            apt.criteria
                              .filter(ac => ac.value === 1 && ac.type === 'con')
                              .map(ac => (
                                <div key={`ex-crit-${apt.id}-${ac.criteria_id}`} className="flex items-center gap-1 text-slate-300">
                                  <X className="h-3.5 w-3.5 text-rose-500 flex-shrink-0" />
                                  <span>{ac.name}</span>
                                </div>
                              ))
                          ) : (
                            <p className="text-slate-500 italic">None</p>
                          )}
                        </div>
                      </div>

                      {/* Notes Box */}
                      {apt.notes && (
                        <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                          <span className="font-bold text-slate-400 block mb-1">Notes</span>
                          {apt.notes}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions buttons */}
                  <div className="mt-auto pt-4 border-t border-slate-800/80 flex items-center justify-between gap-3">
                    <button
                      onClick={() => setExpandedApt(isExpanded ? null : apt.id)}
                      className="text-xs font-semibold text-slate-400 hover:text-white transition flex items-center gap-1"
                    >
                      <ChevronsUpDown className="h-3.5 w-3.5" />
                      {isExpanded ? 'Show less' : 'Show details'}
                    </button>
                    
                    <div className="flex items-center gap-1.5">
                      {apt.url && (
                        <a 
                          href={apt.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                          title="Open listing link"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <button
                        onClick={() => onEdit(apt)}
                        className="text-xs font-bold px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDelete(apt.id)}
                        className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition"
                        title="Delete listing"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-card py-16 flex flex-col items-center justify-center text-slate-500 rounded-2xl border border-dashed border-slate-800">
          <Home className="h-16 w-16 mb-3 opacity-30 text-primary-400 animate-bounce" />
          <h3 className="text-lg font-bold text-white">No Apartments Match Filters</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm text-center">
            Try adjusting your search criteria, price range filters, or create a brand new apartment listing.
          </p>
          <button
            onClick={onAddClick}
            className="mt-5 px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-primary-500/20"
          >
            Create New Listing
          </button>
        </div>
      )}
    </div>
  );
}

// 3. CRITERIA & WEIGHTS SLIDERS VIEW (Dual Slider weights configuration)
function CriteriaView({ criteria, settings = {}, onWeightChange, onAddCriteria, onDeleteCriteria }) {
  const [newCritName, setNewCritName] = useState('');
  const [newCritType, setNewCritType] = useState('pro');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newCritName.trim()) return;
    onAddCriteria(newCritName.trim(), newCritType);
    setNewCritName('');
  };

  const pros = criteria.filter(c => c.type === 'pro');
  const cons = criteria.filter(c => c.type === 'con');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in">
      
      {/* Configuration slider cards - left side */}
      <div className="lg:col-span-8 space-y-8">
        
        {/* Pros Weighing */}
        <div className="glass-card p-6 rounded-2xl space-y-6">
          <div>
            <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
              <Check className="h-5 w-5 bg-emerald-500/20 rounded p-0.5" />
              Weight Pros (+1 to +5)
            </h3>
            <p className="text-xs text-slate-400 mt-1">Specify how much you or your partner care about these items. Larger weights raise scores.</p>
          </div>

          <div className="space-y-6">
            {pros.map(c => (
              <CriteriaWeightItem 
                key={`cw-${c.id}`}
                item={c} 
                settings={settings}
                onWeightChange={onWeightChange}
                onDelete={onDeleteCriteria}
                minVal={1}
                maxVal={5}
              />
            ))}
            {pros.length === 0 && <p className="text-xs text-slate-500 italic">No pros defined yet.</p>}
          </div>
        </div>

        {/* Cons Weighing */}
        <div className="glass-card p-6 rounded-2xl space-y-6">
          <div>
            <h3 className="text-lg font-bold text-rose-400 flex items-center gap-2">
              <X className="h-5 w-5 bg-rose-500/20 rounded p-0.5" />
              Weight Cons (1 to 5)
            </h3>
            <p className="text-xs text-slate-400 mt-1">Flag items that degrade the apartment's desirability. Higher weights penalize scores heavier.</p>
          </div>

          <div className="space-y-6">
            {cons.map(c => (
              <CriteriaWeightItem 
                key={`cw-${c.id}`}
                item={c} 
                settings={settings}
                onWeightChange={onWeightChange}
                onDelete={onDeleteCriteria}
                minVal={1}
                maxVal={5}
              />
            ))}
            {cons.length === 0 && <p className="text-xs text-slate-500 italic">No cons defined yet.</p>}
          </div>
        </div>

      </div>

      {/* Settings / Create Criteria - right side */}
      <div className="lg:col-span-4 space-y-6">
        <div className="glass-card p-6 rounded-2xl">
          <h3 className="text-base font-bold text-white mb-4">Add Custom Criterion</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Criterion Name</label>
              <input
                type="text"
                placeholder="e.g., Balcony, Quiet bedroom"
                value={newCritName}
                onChange={(e) => setNewCritName(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:border-primary-500 focus:outline-none text-sm text-slate-200"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewCritType('pro')}
                  className={`py-2 text-xs font-bold rounded-lg border transition ${
                    newCritType === 'pro'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  Pro (Desirable)
                </button>
                <button
                  type="button"
                  onClick={() => setNewCritType('con')}
                  className={`py-2 text-xs font-bold rounded-lg border transition ${
                    newCritType === 'con'
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/50'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  Con (Penalty)
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl text-xs transition"
            >
              Add Criterion
            </button>
          </form>
        </div>
      </div>

    </div>
  );
}

// Single Criteria Config line with dual sliders (Me / Partner)
function CriteriaWeightItem({ item, onWeightChange, onDelete, minVal, maxVal, settings = {} }) {
  return (
    <div className="py-2 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h4 className="font-semibold text-white text-sm">{item.name}</h4>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase mt-1 inline-block ${
            item.type === 'pro' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
          }`}>
            {item.type}
          </span>
        </div>
        <button
          onClick={() => onDelete(item.id)}
          className="text-slate-500 hover:text-rose-400 p-1.5 rounded hover:bg-rose-500/10 transition"
          title="Delete criterion"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Slider inputs */}
      <div className={settings.SHOPPING_MODE === 'single' ? "pl-2" : "grid grid-cols-1 md:grid-cols-2 gap-4 pl-2"}>
        {/* User Weight Slider */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-medium text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 bg-primary-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">U</span>
              {settings.SHOPPING_MODE === 'single' ? 'Importance Weight' : 'My Weight'}
            </span>
            <span className="font-mono text-primary-400 font-bold">
              {item.user_weight} <span className="text-[10px] text-slate-500 font-semibold ml-1">({getPriorityLabel(item.user_weight)})</span>
            </span>
          </div>
          <BeadedSlider
            value={item.user_weight}
            onChange={(val) => onWeightChange(item.id, 'user', val)}
            min={minVal}
            max={maxVal}
            colorClass="primary"
          />
        </div>

        {/* Partner Weight Slider */}
        {settings.SHOPPING_MODE !== 'single' && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-medium text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-4 bg-pink-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">P</span>
                Partner's Weight
              </span>
              <span className="font-mono text-pink-400 font-bold">
                {item.partner_weight} <span className="text-[10px] text-slate-500 font-semibold ml-1">({getPriorityLabel(item.partner_weight)})</span>
              </span>
            </div>
            <BeadedSlider
              value={item.partner_weight}
              onChange={(val) => onWeightChange(item.id, 'partner', val)}
              min={minVal}
              max={maxVal}
              colorClass="pink"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// 4. SETTINGS VIEW (Google Maps API Key, POI Addresses config)
function SettingsView({ settings, pois, onSaveApiKey, onSaveSetting, onAddPoi, onUpdatePoi, onDeletePoi, onExportData, onImportData }) {
  const [apiKeyInput, setApiKeyInput] = useState(settings.GOOGLE_MAPS_API_KEY || '');
  const [newPoiName, setNewPoiName] = useState('');
  const [newPoiAddress, setNewPoiAddress] = useState('');
  const [newPoiIcon, setNewPoiIcon] = useState('📍');
  const [editingPoiId, setEditingPoiId] = useState(null);

  const handlePoiNameChange = (val) => {
    setNewPoiName(val);
    if (editingPoiId === null) {
      setNewPoiIcon(getDefaultPoiEmoji(val));
    }
  };

  const handleApiKeySubmit = (e) => {
    e.preventDefault();
    onSaveApiKey(apiKeyInput.trim());
  };

  const startEditPoi = (poi) => {
    setEditingPoiId(poi.id);
    setNewPoiName(poi.name);
    setNewPoiAddress(poi.address || '');
    setNewPoiIcon(poi.icon || '📍');
  };

  const cancelEditPoi = () => {
    setEditingPoiId(null);
    setNewPoiName('');
    setNewPoiAddress('');
    setNewPoiIcon('📍');
  };

  const handlePoiSubmit = (e) => {
    e.preventDefault();
    if (!newPoiName.trim()) return;
    if (editingPoiId !== null) {
      onUpdatePoi(editingPoiId, newPoiName.trim(), newPoiAddress.trim(), newPoiIcon);
      setEditingPoiId(null);
    } else {
      onAddPoi(newPoiName.trim(), newPoiAddress.trim(), newPoiIcon);
    }
    setNewPoiName('');
    setNewPoiAddress('');
    setNewPoiIcon('📍');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
      
      {/* Left panel - API configuration & General Preferences */}
      <div className="space-y-6">
        {/* General Preferences */}
        <div className="glass-card p-6 rounded-2xl space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Sliders className="h-5 w-5 text-primary-400" />
            General Preferences
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Configure how VibeNest scores and displays comparisons.
          </p>

          <div className="space-y-3">
            <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Shopping Mode</label>
            <div className="flex bg-slate-950/85 border border-slate-800 rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => onSaveSetting('SHOPPING_MODE', 'single')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition duration-200 ${settings.SHOPPING_MODE === 'single' ? 'bg-primary-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Individual (Single)
              </button>
              <button
                type="button"
                onClick={() => onSaveSetting('SHOPPING_MODE', 'couple')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition duration-200 ${settings.SHOPPING_MODE !== 'single' ? 'bg-primary-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Shared (with Partner)
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1 leading-normal">
              Selecting "Individual (Single)" simplifies the interface by hiding the partner's score columns, weights, and comparative graphs.
            </p>
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Compass className="h-5 w-5 text-indigo-400" />
            Google Maps API Integration
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            By supplying a Google Maps API Key, the application automatically computes driving distances and travel times for rush hour commutes (pessimistic models) and normal driving.
          </p>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 text-xs text-slate-400 leading-normal space-y-1.5">
            <span className="font-bold text-slate-300 block">How to get a key?</span>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Open Google Cloud Console.</li>
              <li>Create a new project and configure a billing method (includes free $200 monthly credits).</li>
              <li>Enable the **Distance Matrix API** and **Geocoding API**.</li>
              <li>Generate an API credential key and paste it below.</li>
            </ol>
          </div>

          <form onSubmit={handleApiKeySubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Google Maps API Key</label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:border-primary-500 focus:outline-none text-sm text-slate-200"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl text-xs transition"
            >
              Save API Key
            </button>
          </form>
        </div>

        {/* Backup & Share Data */}
        <div className="glass-card p-6 rounded-2xl space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Download className="h-5 w-5 text-emerald-400" />
            Backup & Share Data
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Export all your apartments, settings, points of interest, and custom attributes to a JSON file. You can import this file on another browser or backup your data.
          </p>

          <div className="flex gap-4">
            <button
              onClick={onExportData}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition"
            >
              <Download className="h-4 w-4" />
              Export JSON
            </button>

            <label className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs cursor-pointer transition">
              <Upload className="h-4 w-4" />
              Import JSON
              <input
                type="file"
                accept=".json"
                onChange={onImportData}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Right panel - Points of Interest address setup */}
      <div className="space-y-6">
        <div className="glass-card p-6 rounded-2xl space-y-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <MapPin className="h-5 w-5 text-cyan-400" />
              Points of Interest (POIs)
            </h3>
            <p className="text-xs text-slate-400 mt-1">Manage core destinations (e.g. Work, Partner's Office, Gym, Grocery Store) that you check apartment commute times against.</p>
          </div>

          {/* List of current POIs */}
          <div className="space-y-3 divide-y divide-slate-800 max-h-60 overflow-y-auto pr-1">
            {pois.map(poi => (
              <div key={`poi-row-${poi.id}`} className="flex items-center justify-between pt-3 first:pt-0">
                <div>
                  <h4 className="font-semibold text-slate-200 text-sm flex items-center gap-1.5">
                    <span className="text-base select-none">{poi.icon || '📍'}</span>
                    {poi.name}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">{poi.address || 'Manual entries'}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEditPoi(poi)}
                    className="text-slate-500 hover:text-cyan-400 p-1.5 rounded hover:bg-cyan-500/10 transition"
                    title="Edit location"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onDeletePoi(poi.id)}
                    className="text-slate-500 hover:text-rose-400 p-1.5 rounded hover:bg-rose-500/10 transition"
                    title="Remove location"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {pois.length === 0 && <p className="text-xs text-slate-500 italic py-4 text-center">No locations added yet.</p>}
          </div>

          {/* Add POI Form */}
          <form onSubmit={handlePoiSubmit} className="space-y-4 pt-4 border-t border-slate-800/80">
            <h4 className="text-sm font-bold text-slate-300">
              {editingPoiId !== null ? 'Edit Location' : 'Add New Location'}
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Location Name</label>
                <input
                  type="text"
                  placeholder="e.g., Partner Office, Trader Joe's"
                  value={newPoiName}
                  onChange={(e) => handlePoiNameChange(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:border-primary-500 focus:outline-none text-sm text-slate-200"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Full Street Address</label>
                <input
                  type="text"
                  placeholder="123 Main St, Seattle WA"
                  value={newPoiAddress}
                  onChange={(e) => setNewPoiAddress(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:border-primary-500 focus:outline-none text-sm text-slate-200"
                />
              </div>
            </div>

            {/* Custom Emoji Selector */}
            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Map Marker Emoji</label>
              <div className="flex flex-wrap gap-2 p-3 bg-slate-950 border border-slate-800 rounded-xl">
                {['📍', '💼', '🏢', '🏋️', '🛒', '🌳', '☕', '🍴', '🎓', '🏠', '💑', '🏥', '🏖️'].map(emoji => (
                  <button
                    type="button"
                    key={`emoji-select-${emoji}`}
                    onClick={() => setNewPoiIcon(emoji)}
                    className={`w-9 h-9 text-lg rounded-lg flex items-center justify-center border transition-all duration-200 ${
                      newPoiIcon === emoji 
                        ? 'bg-cyan-600/20 border-cyan-500 scale-110 shadow shadow-cyan-500/30' 
                        : 'border-slate-850 bg-slate-900/50 hover:bg-slate-900 hover:border-slate-700'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
                
                {/* Manual emoji input if they want to type one */}
                <input
                  type="text"
                  maxLength="2"
                  value={newPoiIcon}
                  onChange={(e) => setNewPoiIcon(e.target.value)}
                  className="w-12 h-9 px-2 text-center bg-slate-900 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 font-bold"
                  title="Type any custom emoji"
                />
              </div>
              <p className="text-[10px] text-slate-500">
                Markers will automatically update on the interactive GeoNest map with your selected emoji.
              </p>
            </div>
            
            <div className="flex gap-2">
              <button
                type="submit"
                className="py-2 px-4 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl text-xs transition"
              >
                {editingPoiId !== null ? 'Save Changes' : 'Add Location'}
              </button>
              {editingPoiId !== null && (
                <button
                  type="button"
                  onClick={cancelEditPoi}
                  className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

    </div>
  );
}

// 5. APARTMENT ENTRY & EDIT MODAL
function ApartmentModal({ apartment, pois, criteria, settings = {}, isStandalone, onWeightChange, onAddCriteria, onClose, onSave }) {
  const [name, setName] = useState(apartment?.name || '');
  const [address, setAddress] = useState(apartment?.address || '');
  const [rent, setRent] = useState(apartment?.rent || '');
  const [url, setUrl] = useState(apartment?.url || '');
  const [googleReviewScore, setGoogleReviewScore] = useState(apartment?.google_review_score || '');
  const [notes, setNotes] = useState(apartment?.notes || '');
  const [bedrooms, setBedrooms] = useState(apartment?.bedrooms || '');
  const [bathrooms, setBathrooms] = useState(apartment?.bathrooms || '');

  // Inline Attribute creation state
  const [showAddCrit, setShowAddCrit] = useState(false);
  const [newCritName, setNewCritName] = useState('');
  const [newCritType, setNewCritType] = useState('pro');
  const [newCritUserWeight, setNewCritUserWeight] = useState(3);
  const [newCritPartnerWeight, setNewCritPartnerWeight] = useState(3);

  // File Upload State
  const [floorplanFile, setFloorplanFile] = useState(null);
  const [floorplanPreview, setFloorplanPreview] = useState(apartment?.floorplan_image ? `${API_URL}${apartment.floorplan_image}` : null);
  const [floorplanBase64, setFloorplanBase64] = useState('');

  // Criteria Selection (Map of crit_id -> boolean)
  const [criteriaMap, setCriteriaMap] = useState({});

  // Manual distances configuration (poi_id -> {normal_time_mins, rush_hour_time_mins, distance_miles})
  const [distances, setDistances] = useState({});

  useEffect(() => {
    // Populate active criteria matches
    const map = {};
    criteria.forEach(crit => {
      const match = apartment?.criteria?.find(ac => ac.criteria_id === crit.id);
      map[crit.id] = match ? match.value === 1 : false;
    });
    setCriteriaMap(map);

    // Populate distances
    const distMap = {};
    pois.forEach(poi => {
      const dist = apartment?.distances?.find(d => d.poi_id === poi.id);
      distMap[poi.id] = {
        normal_time_mins: dist?.normal_time_mins || '',
        rush_hour_time_mins: dist?.rush_hour_time_mins || '',
        distance_miles: dist?.distance_miles || ''
      };
    });
    setDistances(distMap);
  }, [apartment, criteria, pois]);

  // Handle Clipboard Paste of Images (Ctrl+V)
  const handlePaste = (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
      const item = items[index];
      if (item.kind === 'file') {
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => {
          setFloorplanPreview(event.target.result);
          setFloorplanBase64(event.target.result); // Base64 formatted string
          setFloorplanFile(null); // Clear raw file selector
        };
        reader.readAsDataURL(blob);
      }
    }
  };

  // Handle File Input selection
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFloorplanFile(file);
      setFloorplanBase64(''); // Clear base64 if uploading file
      setFloorplanPreview(URL.createObjectURL(file));
    }
  };

  const handleCriteriaChange = (id) => {
    setCriteriaMap(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleDistanceChange = (poiId, field, value) => {
    setDistances(prev => ({
      ...prev,
      [poiId]: {
        ...prev[poiId],
        [field]: value
      }
    }));
  };

  const handleAddCritSubmit = async (e) => {
    e.preventDefault();
    if (!newCritName.trim()) return;

    const newCritObj = await onAddCriteria(
      newCritName.trim(),
      newCritType,
      parseInt(newCritUserWeight),
      parseInt(newCritPartnerWeight)
    );

    if (newCritObj) {
      setCriteriaMap(prev => ({
        ...prev,
        [newCritObj.id]: true
      }));
      setNewCritName('');
      setShowAddCrit(false);
    }
  };

  // Save changes
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isStandalone) {
      // 1. Geocode client-side
      const coords = await clientGeocode(address);

      // 2. Generate distances to all POIs
      const calculatedDistances = pois.map(poi => {
        const manual = distances[poi.id] || {};
        
        let dMiles = manual.distance_miles ? parseFloat(manual.distance_miles) : null;
        let normalTime = manual.normal_time_mins ? parseInt(manual.normal_time_mins) : null;
        let rushTime = manual.rush_hour_time_mins ? parseInt(manual.rush_hour_time_mins) : null;

        if (dMiles === null || isNaN(dMiles)) {
          const dist = calculateHaversineDistance(coords.lat, coords.lon, poi.latitude, poi.longitude);
          dMiles = parseFloat(dist.toFixed(2));
          normalTime = Math.round(dist * 2.5);
          rushTime = Math.round(dist * 3.5);
        }

        return {
          poi_id: poi.id,
          poi_name: poi.name,
          poi_address: poi.address,
          normal_time_mins: normalTime,
          rush_hour_time_mins: rushTime,
          distance_miles: dMiles
        };
      });

      // 3. Map criteria values
      const criteriaList = criteria.map(crit => {
        const isSet = !!criteriaMap[crit.id];
        return {
          criteria_id: crit.id,
          name: crit.name,
          type: crit.type,
          user_weight: crit.user_weight,
          partner_weight: crit.partner_weight,
          value: isSet ? 1 : 0
        };
      });

      // 4. Create/Update apartment object
      const aptObj = {
        id: apartment ? apartment.id : Date.now(),
        name,
        address,
        rent: rent ? parseInt(rent) : null,
        url,
        google_review_score: googleReviewScore ? parseFloat(googleReviewScore) : null,
        bedrooms: bedrooms ? parseInt(bedrooms) : null,
        bathrooms: bathrooms ? parseFloat(bathrooms) : null,
        notes,
        latitude: coords.lat,
        longitude: coords.lon,
        floorplan_image: floorplanFile ? floorplanPreview : (floorplanBase64 ? floorplanBase64 : (apartment?.floorplan_image || '')),
        distances: calculatedDistances,
        criteria: criteriaList
      };

      const localApts = JSON.parse(localStorage.getItem('vibenest_apartments')) || [];
      let updatedApts;
      if (apartment) {
        updatedApts = localApts.map(a => a.id === apartment.id ? aptObj : a);
      } else {
        updatedApts = [...localApts, aptObj];
      }
      localStorage.setItem('vibenest_apartments', JSON.stringify(updatedApts));

      onSave(); // Refetch data
      onClose(); // Close modal
      return;
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('address', address);
    formData.append('rent', rent);
    formData.append('url', url);
    formData.append('google_review_score', googleReviewScore);
    formData.append('bedrooms', bedrooms);
    formData.append('bathrooms', bathrooms);
    formData.append('notes', notes);
    formData.append('criteriaMap', JSON.stringify(criteriaMap));
    formData.append('custom_distances', JSON.stringify(distances));

    if (floorplanFile) {
      formData.append('floorplan', floorplanFile);
    } else if (floorplanBase64) {
      formData.append('floorplan_base64', floorplanBase64);
    }

    try {
      const urlPath = apartment ? `/api/apartments/${apartment.id}` : '/api/apartments';
      const method = apartment ? 'PUT' : 'POST';

      const res = await fetch(`${API_URL}${urlPath}`, {
        method,
        body: formData
      });

      if (res.ok) {
        onSave();
        onClose();
      } else {
        const data = await res.json();
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error('Error saving apartment:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div 
        onPaste={handlePaste}
        className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 md:p-8 space-y-6"
      >
        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-xl font-bold text-white">{apartment ? 'Edit Apartment' : 'Add New Apartment'}</h3>
            <p className="text-xs text-slate-400 mt-1">Complete details, check off pros/cons, and paste floorplan images.</p>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Standard Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Apartment Name *</label>
              <input
                type="text"
                placeholder="e.g., Cedar Ridge Apts"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:border-primary-500 focus:outline-none text-sm text-slate-200"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Rent Price *</label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-semibold">$</div>
                <input
                  type="number"
                  placeholder="1885"
                  value={rent}
                  onChange={(e) => setRent(e.target.value)}
                  className="w-full pl-8 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:border-primary-500 focus:outline-none text-sm text-slate-200"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Google Review Score</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="5"
                placeholder="4.2"
                value={googleReviewScore}
                onChange={(e) => setGoogleReviewScore(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:border-primary-500 focus:outline-none text-sm text-slate-200"
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Full Street Address</label>
              <input
                type="text"
                placeholder="400 Pine St, Seattle WA 98101"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:border-primary-500 focus:outline-none text-sm text-slate-200"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Listing URL</label>
              <input
                type="url"
                placeholder="https://zillow.com/homedetails/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:border-primary-500 focus:outline-none text-sm text-slate-200"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Bedrooms</label>
              <input
                type="number"
                min="0"
                placeholder="e.g., 2"
                value={bedrooms}
                onChange={(e) => setBedrooms(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:border-primary-500 focus:outline-none text-sm text-slate-200"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Bathrooms</label>
              <input
                type="number"
                step="0.5"
                min="0"
                placeholder="e.g., 1.5"
                value={bathrooms}
                onChange={(e) => setBathrooms(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:border-primary-500 focus:outline-none text-sm text-slate-200"
              />
            </div>
          </div>

          {/* Section 2: Floorplan Paste / Upload */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Floorplan Image</label>
              <div className="border border-dashed border-slate-800 bg-slate-950/60 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:border-primary-500/50 transition-all relative">
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Clipboard className="h-8 w-8 text-primary-400 opacity-60 mb-2" />
                <span className="text-xs font-semibold text-slate-300">Click to upload file</span>
                <span className="text-[10px] text-slate-500 mt-1 block">Or copy an image elsewhere and **press Ctrl+V inside this modal** to paste directly.</span>
              </div>
            </div>

            <div className="flex items-center justify-center bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 min-h-[150px] relative">
              {floorplanPreview ? (
                <>
                  <img src={floorplanPreview} alt="Floorplan Preview" className="h-full max-h-40 object-contain p-2" />
                  <button 
                    type="button"
                    onClick={() => { setFloorplanPreview(null); setFloorplanFile(null); setFloorplanBase64(''); }}
                    className="absolute top-2 right-2 p-1.5 bg-rose-500/90 text-white rounded-lg hover:bg-rose-600 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <span className="text-xs text-slate-600 font-medium tracking-wider uppercase select-none">No preview available</span>
              )}
            </div>
          </div>

          {/* Section 3: Points of Interest commute inputs */}
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-bold text-slate-200">Commute matrix (Normal / Rush hour)</h4>
              <p className="text-[10px] text-slate-500 mt-0.5">Enter driving times manually (mins) and distance (mi), or leave blank for automated coordinates estimation.</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pois.map(poi => (
                <div key={`modal-poi-${poi.id}`} className="bg-slate-950/80 p-4 rounded-xl border border-slate-850 space-y-3">
                  <span className="text-xs font-bold text-slate-300 block">{poi.name} commute</span>
                  
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500">Normal (m)</label>
                      <input
                        type="number"
                        value={distances[poi.id]?.normal_time_mins || ''}
                        onChange={(e) => handleDistanceChange(poi.id, 'normal_time_mins', e.target.value)}
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded focus:outline-none text-xs text-slate-200 text-center font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-rose-400">Traffic (m)</label>
                      <input
                        type="number"
                        value={distances[poi.id]?.rush_hour_time_mins || ''}
                        onChange={(e) => handleDistanceChange(poi.id, 'rush_hour_time_mins', e.target.value)}
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded focus:outline-none text-xs text-slate-200 text-center font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500">Dist (mi)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={distances[poi.id]?.distance_miles || ''}
                        onChange={(e) => handleDistanceChange(poi.id, 'distance_miles', e.target.value)}
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded focus:outline-none text-xs text-slate-200 text-center font-mono"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Criteria Selection & Weights adjusting */}
          <div className="space-y-3">
            <div className="flex justify-between items-center border-b border-slate-850 pb-2">
              <h4 className="text-sm font-bold text-slate-200">Select & Weight attributes</h4>
              <button
                type="button"
                onClick={() => setShowAddCrit(!showAddCrit)}
                className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-primary-400 rounded-lg transition"
              >
                <Plus className="h-3.5 w-3.5" />
                {showAddCrit ? 'Cancel' : 'New Attribute'}
              </button>
            </div>

            {/* Inline Criterion Creation Form */}
            {showAddCrit && (
              <div className="bg-slate-950/80 border border-slate-800/80 p-4 rounded-2xl space-y-4 animate-fade-in">
                <p className="text-xs font-bold text-white uppercase tracking-wider">Create New Attribute</p>
                <div className={settings.SHOPPING_MODE === 'single' ? "grid grid-cols-1 sm:grid-cols-3 gap-4 items-end" : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end"}>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-semibold uppercase">Attribute Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Near Light Rail"
                      value={newCritName}
                      onChange={(e) => setNewCritName(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg focus:outline-none text-xs text-slate-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-semibold uppercase">Type</label>
                    <select
                      value={newCritType}
                      onChange={(e) => {
                        setNewCritType(e.target.value);
                        setNewCritUserWeight(3);
                        setNewCritPartnerWeight(3);
                      }}
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg focus:outline-none text-xs text-slate-200 cursor-pointer"
                    >
                      <option value="pro">Pro (Desirable)</option>
                      <option value="con">Con (Penalty)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-semibold uppercase">
                      {settings.SHOPPING_MODE === 'single' ? `Importance Weight (${newCritUserWeight})` : `My Weight (${newCritUserWeight})`}
                    </label>
                    <BeadedSlider
                      value={newCritUserWeight}
                      onChange={(val) => setNewCritUserWeight(val)}
                      min={1}
                      max={5}
                      colorClass="primary"
                    />
                  </div>
                  {settings.SHOPPING_MODE !== 'single' && (
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 font-semibold uppercase">Partner Weight ({newCritPartnerWeight})</label>
                      <BeadedSlider
                        value={newCritPartnerWeight}
                        onChange={(val) => setNewCritPartnerWeight(val)}
                        min={1}
                        max={5}
                        colorClass="pink"
                      />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleAddCritSubmit}
                  className="px-4 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-lg transition"
                >
                  Create & Select
                </button>
              </div>
            )}

            {/* Grid of Attributes with weights inside the modal */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {criteria.map(crit => {
                const isSelected = !!criteriaMap[crit.id];
                return (
                  <div 
                    key={`modal-crit-${crit.id}`}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                      isSelected 
                        ? 'bg-slate-900/60 border-primary-500/50 shadow-md shadow-primary-500/5' 
                        : 'bg-slate-950/20 border-slate-850 hover:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleCriteriaChange(crit.id)}
                        className="flex items-center gap-2 text-xs font-bold transition text-left flex-1"
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          isSelected 
                            ? crit.type === 'pro' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-rose-600 border-rose-500 text-white'
                            : 'border-slate-700'
                        }`}>
                          {isSelected && <Check className="h-2.5 w-2.5 stroke-[3px]" />}
                        </div>
                        <span className={isSelected ? 'text-white' : 'text-slate-400 font-medium'}>{crit.name}</span>
                      </button>
                      <span className={`text-[8px] px-1.5 py-0.2 rounded font-bold uppercase flex-shrink-0 ${
                        crit.type === 'pro' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {crit.type}
                      </span>
                    </div>

                    {/* Compact Weight Sliders */}
                    <div className={settings.SHOPPING_MODE === 'single' ? "mt-3.5 pt-2 border-t border-slate-800/80 text-[10px] space-y-2" : "mt-3.5 pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-3 text-[10px]"}>
                      <div className="space-y-1">
                        <div className="flex justify-between text-slate-400 font-semibold">
                          <span>{settings.SHOPPING_MODE === 'single' ? 'Importance:' : 'Me:'}</span>
                          <span className="font-mono text-primary-400 font-bold">
                            {crit.user_weight} <span className="text-[8px] text-slate-500 font-normal ml-0.5">({getPriorityLabel(crit.user_weight)})</span>
                          </span>
                        </div>
                        <BeadedSlider
                          value={crit.user_weight}
                          onChange={(val) => onWeightChange(crit.id, 'user', val)}
                          min={1}
                          max={5}
                          colorClass="primary"
                        />
                      </div>
                      {settings.SHOPPING_MODE !== 'single' && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-slate-400 font-semibold">
                            <span>Partner:</span>
                            <span className="font-mono text-pink-400 font-bold">
                              {crit.partner_weight} <span className="text-[8px] text-slate-500 font-normal ml-0.5">({getPriorityLabel(crit.partner_weight)})</span>
                            </span>
                          </div>
                          <BeadedSlider
                            value={crit.partner_weight}
                            onChange={(val) => onWeightChange(crit.id, 'partner', val)}
                            min={1}
                            max={5}
                            colorClass="pink"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 5: Notes */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">General notes</label>
            <textarea
              rows="3"
              placeholder="Pros: great light in living room, quiet patio. Cons: small walk-in closet..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:border-primary-500 focus:outline-none text-sm text-slate-200 leading-normal"
            ></textarea>
          </div>

          {/* Modal Actions */}
          <div className="border-t border-slate-800 pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-primary-500/20"
            >
              {apartment ? 'Save Changes' : 'Create Listing'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
