#!/usr/bin/env python3
"""Convert ASCII PeTar snapshots in the supplied tar.gz into an ID-aligned cache."""
from __future__ import annotations
import argparse, json, tarfile
from pathlib import Path
import numpy as np

FIELDS = 11  # xyz, vxyz, mass, stellar type, BSE radius, luminosity, present flag

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('archive', type=Path)
    parser.add_argument('--out', type=Path, default=Path('public/data'))
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    with tarfile.open(args.archive, 'r:gz') as archive:
        members = {Path(m.name).name: m for m in archive.getmembers() if Path(m.name).name.startswith('data.') and Path(m.name).name[5:].isdigit()}
        indexes = sorted(int(n[5:]) for n in members)
        if not indexes or indexes != list(range(len(indexes))):
            raise ValueError('Snapshot files must be a contiguous data.0...data.N sequence')
        raw = []; times=[]; counts=[]; centers=[]; all_ids=set(); checks=[]
        for index in indexes:
            stream = archive.extractfile(members[f'data.{index}'])
            if stream is None: raise ValueError(f'Cannot read data.{index}')
            header=stream.readline().decode('ascii').split()
            file_id, count, time_myr = int(header[0]), int(header[1]), float(header[2])
            arr=np.loadtxt(stream, dtype=np.float64)
            if arr.ndim == 1: arr=arr[None,:]
            if file_id != index or arr.shape != (count,36): raise ValueError(f'data.{index}: unexpected header/table shape {arr.shape}')
            ids=arr[:,25].astype(np.int64)
            if len(np.unique(ids)) != len(ids): raise ValueError(f'data.{index}: duplicate particle ID')
            ci=int(np.argmax(arr[:,0])); center_id=int(ids[ci]); center=arr[ci]
            all_ids.update(map(int,ids)); raw.append((ids,arr,ci)); times.append(time_myr); counts.append(count); centers.append(center_id)
            checks.append({'index':index,'time_myr':time_myr,'particles':count,'center_id':center_id,'center_mass_msun':float(center[0])})
        times=np.asarray(times,dtype=np.float64)
        if not np.all(np.diff(times)>0): raise ValueError('Snapshot times are not strictly increasing')
        ids=np.asarray(sorted(all_ids),dtype=np.int32); id_to_slot={int(pid):i for i,pid in enumerate(ids)}
        frames=np.zeros((len(raw),len(ids),FIELDS),dtype='<f4')
        for fi,(pids,arr,ci) in enumerate(raw):
            c=arr[ci]
            for j,row in enumerate(arr):
                slot=id_to_slot[int(pids[j])]
                frames[fi,slot,0:3]=row[1:4]-c[1:4]
                frames[fi,slot,3:6]=row[4:7]-c[4:7]
                frames[fi,slot,6]=row[0]
                frames[fi,slot,7]=row[12]  # SSE/BSE stellar type, 1-based column 13
                frames[fi,slot,8]=row[15]  # BSE radius in R_sun, 1-based column 16
                frames[fi,slot,9]=row[23]  # luminosity in L_sun, 1-based column 24
                frames[fi,slot,10]=1
        binary=args.out/'snapshots.bin'; frames.tofile(binary)
        metadata={'format':'petar-interleaved-f32-v1','fields':['x_pc_relative_to_vms','y_pc_relative_to_vms','z_pc_relative_to_vms','vx_pc_myr_relative_to_vms','vy_pc_myr_relative_to_vms','vz_pc_myr_relative_to_vms','mass_msun','stellar_type','bse_radius_rsun','luminosity_lsun','present'],'frameCount':len(raw),'particleCount':len(ids),'particleIds':ids.tolist(),'timeMyr':times.tolist(),'counts':counts,'centerIds':centers,'centerMassMsun':[c['center_mass_msun'] for c in checks],'units':{'position':'pc relative to most massive particle in each snapshot','velocity':'pc/Myr relative to most massive particle','time':'Myr','mass':'Msun','bseRadius':'Rsun','luminosity':'Lsun'},'source':'n200_fixedwind_raw_t0-0p07893Myr.tar.gz','summary':{'snapshotCount':len(raw),'firstTimeYr':float(times[0]*1e6),'lastTimeYr':float(times[-1]*1e6),'strictlyIncreasing':True,'idUniquenessPerSnapshot':True,'uniqueParticleIds':len(ids),'firstCenterId':centers[0],'lastCenterId':centers[-1],'firstCenterMassMsun':checks[0]['center_mass_msun'],'lastCenterMassMsun':checks[-1]['center_mass_msun'],'binaryBytes':binary.stat().st_size}}
        (args.out/'metadata.json').write_text(json.dumps(metadata,separators=(',',':'))+'\n')
        print(json.dumps(metadata['summary'],indent=2))
if __name__=='__main__': main()
