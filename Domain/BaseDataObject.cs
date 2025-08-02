using MongoDB.Bson.Serialization.Attributes;
using System;
using System.ComponentModel.DataAnnotations;

namespace Domain
{
    public class BaseDataObject
    {
        public Guid Id { get; set; }
        public DateTimeOffset DateCreated { get; set; }
        public DateTimeOffset DateUpdated { get; set; }
        
        [BsonElement("version")]
        [BsonRequired]
        [Required]
        public long Version { get; set; }
        
        public BaseDataObject()
        {
            Version = 1;
        }
    }
}