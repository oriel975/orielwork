# -*- coding: utf-8 -*-
"""
Created on Tue Mar 30 11:23:46 2021

@author: User
"""
 
def revword(word):
    return word[::-1].lower()



def countword():
   with open("text.txt", "r") as a_file:
    word = a_file.readline().strip()
  
    counter=1
    for line in a_file:   
     stripped_line = line.strip()
     split_line=stripped_line.split()
    
     
     outpot_line=list(map(revword,split_line))
   

     for itrated_word in outpot_line:
    
         if itrated_word == word:
             counter=counter+1
    
  
   return counter


     
#print(countword())